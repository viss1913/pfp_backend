const crypto = require('crypto');
const knex = require('../config/database');
const { getAgentNetworkSettings, parseProjectSettings } = require('../utils/projectSettings');

function generateReferralSlug() {
    return crypto.randomBytes(6).toString('hex');
}

async function ensureReferralSlug(agentId, trx = knex) {
    const agent = await trx('agents').where({ id: agentId }).first();
    if (!agent) return null;
    if (agent.referral_slug) return agent.referral_slug;
    const projectId = agent.project_id;
    let slug;
    let guard = 0;
    do {
        slug = generateReferralSlug();
        const exists = await trx('agents')
            .where({ project_id: projectId, referral_slug: slug })
            .whereNot('id', agentId)
            .first();
        if (!exists) break;
        guard += 1;
    } while (guard < 20);
    await trx('agents').where({ id: agentId }).update({ referral_slug: slug, updated_at: new Date() });
    return slug;
}

async function resolveParentAgentFromRef(projectId, ref, trx = knex) {
    const token = String(ref || '').trim();
    if (!token) return null;

    const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);

    let parent;
    if (isUuid) {
        parent = await trx('agents').where({ project_id: projectId, uuid: token }).first();
    } else {
        parent = await trx('agents')
            .where({ project_id: projectId, referral_slug: token })
            .first();
    }

    if (!parent || parent.is_active === false) {
        throw { status: 400, message: 'Недействительная реферальная ссылка' };
    }
    return parent;
}

async function assertValidParentAssignment({ agentId, parentAgentId, projectSettings, trx = knex }) {
    if (parentAgentId == null || parentAgentId === '') return;

    const parentId = Number(parentAgentId);
    if (!Number.isFinite(parentId) || parentId <= 0) {
        throw { status: 400, message: 'Некорректный parent_agent_id' };
    }

    if (agentId != null && Number(agentId) === parentId) {
        throw { status: 400, message: 'Агент не может быть родителем самому себе' };
    }

    const network = getAgentNetworkSettings(projectSettings);
    const maxDepth = Number(network.max_depth) > 0 ? Number(network.max_depth) : 1;

    const parent = await trx('agents').where({ id: parentId }).first();
    if (!parent) {
        throw { status: 400, message: 'Родительский агент не найден' };
    }

    if (maxDepth <= 1 && parent.parent_agent_id != null) {
        throw {
            status: 400,
            message: 'Родитель уже является субагентом — глубина сети ограничена',
        };
    }

    if (agentId != null) {
        let cursor = parent;
        let depth = 0;
        while (cursor && cursor.parent_agent_id && depth < 10) {
            if (Number(cursor.parent_agent_id) === Number(agentId)) {
                throw { status: 400, message: 'Циклическая ссылка в сети агентов' };
            }
            cursor = await trx('agents').where({ id: cursor.parent_agent_id }).first();
            depth += 1;
        }
    }
}

function buildRegistrationAttribution(body = {}) {
    const utm = {};
    for (const [key, value] of Object.entries(body)) {
        if (key.startsWith('utm_') && value != null && String(value).trim() !== '') {
            utm[key] = String(value).trim();
        }
    }
    const out = { captured_at: new Date().toISOString() };
    if (body.ref) out.ref = String(body.ref).trim();
    if (Object.keys(utm).length) out.utm = utm;
    return Object.keys(out).length > 1 ? out : null;
}

async function listSubagents(parentAgentId, projectId, trx = knex) {
    const rows = await trx('agents')
        .leftJoin('users', 'agents.id', 'users.agent_id')
        .where('agents.project_id', projectId)
        .where('agents.parent_agent_id', parentAgentId)
        .select(
            'agents.id',
            'agents.uuid',
            'agents.first_name',
            'agents.last_name',
            'agents.partner_agent_id',
            'agents.referral_slug',
            'agents.is_active',
            'agents.created_at',
            'users.email'
        )
        .orderBy('agents.created_at', 'desc');

    const ids = rows.map((r) => r.id);
    let clientCounts = {};
    if (ids.length) {
        const counts = await trx('clients')
            .whereIn('agent_id', ids)
            .groupBy('agent_id')
            .select('agent_id')
            .count({ cnt: '*' });
        clientCounts = Object.fromEntries(counts.map((c) => [c.agent_id, Number(c.cnt)]));
    }

    return rows.map((r) => ({
        ...r,
        clients_count: clientCounts[r.id] || 0,
    }));
}

async function resolveReferredByAgentId(executorAgentId, trx = knex) {
    if (!executorAgentId) return null;
    const agent = await trx('agents').where({ id: executorAgentId }).first();
    if (!agent) return null;
    if (agent.parent_agent_id) return Number(agent.parent_agent_id);
    return Number(agent.id);
}

module.exports = {
    generateReferralSlug,
    ensureReferralSlug,
    resolveParentAgentFromRef,
    assertValidParentAssignment,
    buildRegistrationAttribution,
    listSubagents,
    resolveReferredByAgentId,
};
