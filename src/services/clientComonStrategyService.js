const knex = require('../config/database');
const { agentComonStrategyService } = require('./agentComonStrategyService');
const comonService = require('./comonService');
const { computeComonProfitMetrics } = require('../utils/comonProfitMetrics');

const RISK_LABELS_RU = {
    conservative: 'Консервативный',
    balanced: 'Сбалансированный',
    aggressive: 'Агрессивный',
};

/**
 * Карточка для клиента: без внутреннего agent_id, с подписью риск-профиля.
 */
function toClientCard(mappedRow) {
    if (!mappedRow) return null;
    const { agent_id: _a, ...rest } = mappedRow;
    return {
        ...rest,
        risk_profile_label_ru: RISK_LABELS_RU[mappedRow.risk_profile] || mappedRow.risk_profile,
    };
}

async function resolveClientAgent(clientId, projectId) {
    const q = knex('clients').where({ id: clientId });
    if (projectId != null) {
        q.andWhere({ project_id: projectId });
    }
    const client = await q.first();
    if (!client) {
        const err = new Error('Client not found');
        err.status = 404;
        throw err;
    }
    return {
        agentId: client.agent_id,
        hasLinkedAgent: Boolean(client.agent_id),
    };
}

class ClientComonStrategyService {
    async listForClient(clientId, projectId) {
        const { agentId, hasLinkedAgent } = await resolveClientAgent(clientId, projectId);
        if (!hasLinkedAgent || !agentId) {
            return {
                strategies: [],
                has_linked_agent: false,
                disclaimer_ru:
                    'К вашему профилю не привязан финансовый консультант. Когда агент закрепит вас за собой, здесь появятся его инвестиционные стратегии для ознакомления.',
            };
        }
        const rows = await agentComonStrategyService.list(agentId, projectId);
        return {
            strategies: rows.map(toClientCard),
            has_linked_agent: true,
            disclaimer_ru:
                'Информация носит ознакомительный характер и не является индивидуальной инвестиционной рекомендацией. Доходность в прошлом не гарантирует доходность в будущем. Условия стратегий на стороне оператора (Comon) могут меняться.',
        };
    }

    async getOneForClient(clientId, projectId, strategyRowId) {
        const { agentId, hasLinkedAgent } = await resolveClientAgent(clientId, projectId);
        if (!hasLinkedAgent || !agentId) {
            const err = new Error('No linked agent');
            err.status = 404;
            throw err;
        }
        const row = await knex('agent_comon_strategies')
            .where({ id: strategyRowId, agent_id: agentId })
            .first();
        if (!row) {
            const err = new Error('Strategy not found');
            err.status = 404;
            throw err;
        }
        const full = await agentComonStrategyService.getById(strategyRowId, agentId, projectId);
        return {
            strategy: toClientCard(full),
            disclaimer_ru:
                'Информация носит ознакомительный характер и не является индивидуальной инвестиционной рекомендацией. Доходность в прошлом не гарантирует доходность в будущем.',
        };
    }

    async getProfitForClient(clientId, projectId, strategyRowId) {
        const { agentId, hasLinkedAgent } = await resolveClientAgent(clientId, projectId);
        if (!hasLinkedAgent || !agentId) {
            const err = new Error('No linked agent');
            err.status = 404;
            throw err;
        }
        const row = await knex('agent_comon_strategies')
            .where({ id: strategyRowId, agent_id: agentId })
            .first();
        if (!row) {
            const err = new Error('Strategy not found');
            err.status = 404;
            throw err;
        }
        return comonService.getStrategyProfit(row.comon_strategy_id);
    }

    async getMetricsForClient(clientId, projectId, strategyRowId) {
        const { agentId, hasLinkedAgent } = await resolveClientAgent(clientId, projectId);
        if (!hasLinkedAgent || !agentId) {
            const err = new Error('No linked agent');
            err.status = 404;
            throw err;
        }
        const row = await knex('agent_comon_strategies')
            .where({ id: strategyRowId, agent_id: agentId })
            .first();
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
            disclaimer_ru:
                'Показатели рассчитаны по данным Comon по методике, описанной в поле metrics.definitions. Краткая история ряда даёт нестабильную «годовую» оценку.',
        };
    }
}

module.exports = {
    clientComonStrategyService: new ClientComonStrategyService(),
    toClientCard,
    RISK_LABELS_RU,
};
