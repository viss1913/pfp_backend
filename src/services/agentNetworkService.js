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

/**
 * Tree depth: 0 = root (no parent_agent_id), 1 = direct subagent, etc.
 * @param {number} parentDepth
 * @param {number} maxDepth
 * @returns {boolean}
 */
function canParentInviteSubagent(parentDepth, maxDepth) {
    const max = Number(maxDepth) > 0 ? Number(maxDepth) : 1;
    return Number(parentDepth) < max;
}

/**
 * @param {number} agentId
 * @param {import('knex').Knex} [trx]
 * @returns {Promise<number>}
 */
async function getAgentTreeDepth(agentId, trx = knex) {
    const startId = Number(agentId);
    if (!Number.isFinite(startId) || startId <= 0) return 0;

    let depth = 0;
    let cursor = await trx('agents').where({ id: startId }).first();
    const seen = new Set();

    while (cursor?.parent_agent_id) {
        if (seen.has(cursor.id)) break;
        seen.add(cursor.id);
        depth += 1;
        const parentId = Number(cursor.parent_agent_id);
        if (!Number.isFinite(parentId) || parentId <= 0) break;
        cursor = await trx('agents').where({ id: parentId }).first();
        if (!cursor) break;
    }

    return depth;
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

    const parentDepth = await getAgentTreeDepth(parentId, trx);
    if (!canParentInviteSubagent(parentDepth, maxDepth)) {
        throw {
            status: 400,
            message: `Достигнут лимит глубины сети (max_depth=${maxDepth})`,
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

/**
 * When ref resolves to a parent with Finam ID, set utm_partner_finam for attribution only.
 * Parent wins over client-supplied value (anti-spoof).
 * @param {object} body
 * @param {{ partner_agent_id?: string|null }|null} parentAgent
 * @returns {object}
 */
function enrichRegistrationAttributionBody(body = {}, parentAgent = null) {
    const out = { ...body };
    const parentFinamId =
        parentAgent?.partner_agent_id != null && String(parentAgent.partner_agent_id).trim() !== ''
            ? String(parentAgent.partner_agent_id).trim()
            : null;
    if (parentFinamId) {
        out.utm_partner_finam = parentFinamId;
    }
    return out;
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

/**
 * Payload stored in email_verifications for B2C client registration with agent ref.
 * @param {object} body
 * @param {{ id: number, partner_agent_id?: string|null }|null} parentAgent
 */
function buildClientRegistrationVerificationPayload(body = {}, parentAgent = null) {
    const agentId = parentAgent?.id != null ? Number(parentAgent.id) : null;
    const attributionBody = enrichRegistrationAttributionBody(body, parentAgent);
    return {
        agent_id: Number.isFinite(agentId) && agentId > 0 ? agentId : null,
        ref: body.ref != null && String(body.ref).trim() !== '' ? String(body.ref).trim() : null,
        registration_attribution: buildRegistrationAttribution(attributionBody),
    };
}

function parseEmailVerificationPayload(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(String(raw));
    } catch (_) {
        return {};
    }
}

module.exports = {
    generateReferralSlug,
    ensureReferralSlug,
    resolveParentAgentFromRef,
    canParentInviteSubagent,
    getAgentTreeDepth,
    assertValidParentAssignment,
    enrichRegistrationAttributionBody,
    buildRegistrationAttribution,
    buildClientRegistrationVerificationPayload,
    parseEmailVerificationPayload,
    listSubagents,
    resolveReferredByAgentId,
};
