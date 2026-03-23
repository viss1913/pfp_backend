const knex = require('../config/database');
const comonService = require('./comonService');
const { computeComonProfitMetrics } = require('../utils/comonProfitMetrics');

const RISK = ['conservative', 'balanced', 'aggressive'];

async function assertAgentInProject(agentId, projectId) {
    if (!projectId) {
        const err = new Error('Project context required');
        err.status = 400;
        throw err;
    }
    const row = await knex('agents').where({ id: agentId, project_id: projectId }).first();
    if (!row) {
        const err = new Error('Agent not found');
        err.status = 404;
        throw err;
    }
}

function normalizePortfolio(portfolio) {
    if (!Array.isArray(portfolio)) return portfolio;
    return portfolio.map((p) => ({
        instrument: String(p.instrument).trim(),
        share_percent: Number(p.share_percent),
    }));
}

function mapRow(row) {
    if (!row) return null;
    let portfolio = row.portfolio;
    if (typeof portfolio === 'string') {
        try {
            portfolio = JSON.parse(portfolio);
        } catch {
            portfolio = [];
        }
    }
    const comonStrategyId = row.comon_strategy_id != null ? String(row.comon_strategy_id).trim() : '';
    return {
        id: row.id,
        agent_id: row.agent_id,
        comon_strategy_id: comonStrategyId,
        comon_url: row.comon_url,
        /** Прямая ссылка на API Comon для графика (id из comon_strategy_id) */
        comon_profit_api_url: comonService.strategyProfitApiUrl(comonStrategyId),
        name: row.name,
        min_contribution: row.min_contribution != null ? Number(row.min_contribution) : null,
        risk_profile: row.risk_profile,
        description: row.description,
        portfolio,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

class AgentComonStrategyService {
    async list(agentId, projectId) {
        await assertAgentInProject(agentId, projectId);
        const rows = await knex('agent_comon_strategies')
            .where({ agent_id: agentId })
            .orderBy('updated_at', 'desc');
        return rows.map(mapRow);
    }

    async getById(id, agentId, projectId) {
        await assertAgentInProject(agentId, projectId);
        const row = await knex('agent_comon_strategies')
            .where({ id, agent_id: agentId })
            .first();
        return mapRow(row);
    }

    async create(agentId, projectId, payload) {
        await assertAgentInProject(agentId, projectId);
        const comonStrategyId = comonService.parseStrategyUrlToId(payload.comon_url);
        const portfolio = normalizePortfolio(payload.portfolio);

        try {
            const [insertId] = await knex('agent_comon_strategies').insert({
                agent_id: agentId,
                comon_strategy_id: comonStrategyId,
                comon_url: payload.comon_url ? String(payload.comon_url).trim().slice(0, 512) : null,
                name: payload.name,
                min_contribution: payload.min_contribution != null ? payload.min_contribution : null,
                risk_profile: payload.risk_profile,
                description: payload.description != null ? payload.description : null,
                portfolio: JSON.stringify(portfolio),
                created_at: new Date(),
                updated_at: new Date(),
            });
            const id = typeof insertId === 'object' ? insertId.id : insertId;
            return this.getById(id, agentId, projectId);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
                const err = new Error('This Comon strategy is already linked to your profile');
                err.status = 409;
                throw err;
            }
            throw e;
        }
    }

    async update(id, agentId, projectId, payload) {
        await assertAgentInProject(agentId, projectId);
        const existing = await knex('agent_comon_strategies').where({ id, agent_id: agentId }).first();
        if (!existing) {
            const err = new Error('Strategy not found');
            err.status = 404;
            throw err;
        }

        const patch = {};
        if (payload.name !== undefined) patch.name = payload.name;
        if (payload.min_contribution !== undefined) {
            patch.min_contribution = payload.min_contribution;
        }
        if (payload.risk_profile !== undefined) patch.risk_profile = payload.risk_profile;
        if (payload.description !== undefined) patch.description = payload.description;
        if (payload.portfolio !== undefined) {
            patch.portfolio = JSON.stringify(normalizePortfolio(payload.portfolio));
        }
        if (payload.comon_url !== undefined && payload.comon_url !== null) {
            const trimmed = String(payload.comon_url).trim();
            patch.comon_url = trimmed.slice(0, 512);
            patch.comon_strategy_id = comonService.parseStrategyUrlToId(trimmed);
        }

        if (Object.keys(patch).length === 0) {
            return mapRow(existing);
        }
        patch.updated_at = new Date();

        try {
            const n = await knex('agent_comon_strategies').where({ id, agent_id: agentId }).update(patch);
            if (!n) {
                const err = new Error('Strategy not found');
                err.status = 404;
                throw err;
            }
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
                const err = new Error('Another row already uses this Comon strategy id');
                err.status = 409;
                throw err;
            }
            throw e;
        }

        return this.getById(id, agentId, projectId);
    }

    async remove(id, agentId, projectId) {
        await assertAgentInProject(agentId, projectId);
        const n = await knex('agent_comon_strategies').where({ id, agent_id: agentId }).del();
        if (!n) {
            const err = new Error('Strategy not found');
            err.status = 404;
            throw err;
        }
        return { ok: true };
    }

    async getComonProfitForRow(id, agentId, projectId) {
        const row = await this.getById(id, agentId, projectId);
        if (!row) {
            const err = new Error('Strategy not found');
            err.status = 404;
            throw err;
        }
        return comonService.getStrategyProfit(row.comon_strategy_id);
    }

    /** Метрики по ряду Comon (среднегодовая CAGR, 30д, за весь период). */
    async getProfitMetricsForRow(id, agentId, projectId) {
        const row = await this.getById(id, agentId, projectId);
        if (!row) {
            const err = new Error('Strategy not found');
            err.status = 404;
            throw err;
        }
        const raw = await comonService.getStrategyProfit(row.comon_strategy_id);
        const metrics = computeComonProfitMetrics(raw);
        return {
            comon_strategy_id: row.comon_strategy_id,
            metrics,
        };
    }
}

module.exports = {
    agentComonStrategyService: new AgentComonStrategyService(),
    RISK_PROFILES: RISK,
};
