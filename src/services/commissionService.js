const knex = require('../config/database');
const { getCommissionRulesSettings } = require('../utils/projectSettings');

/**
 * @param {object} payload
 * @param {number} payload.projectId
 * @param {string} payload.eventType
 * @param {number} payload.agentId
 * @param {number|null} [payload.beneficiaryAgentId]
 * @param {number|null} [payload.clientId]
 * @param {number|null} [payload.subagentId]
 * @param {number|null} [payload.amountRub]
 * @param {string|null} [payload.externalRef]
 * @param {object|null} [payload.metadata]
 */
async function recordCommissionEvent(payload, trx = knex) {
    const projectId = Number(payload.projectId);
    const agentId = Number(payload.agentId);
    if (!Number.isFinite(projectId) || !Number.isFinite(agentId)) return null;

    const [insertId] = await trx('commission_events').insert({
        project_id: projectId,
        event_type: payload.eventType,
        agent_id: agentId,
        beneficiary_agent_id: payload.beneficiaryAgentId ?? null,
        client_id: payload.clientId ?? null,
        subagent_id: payload.subagentId ?? null,
        amount_rub: payload.amountRub ?? null,
        external_ref: payload.externalRef ?? null,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
        occurred_at: payload.occurredAt || new Date(),
        created_at: new Date(),
        updated_at: new Date(),
    });

    return typeof insertId === 'object' ? insertId.id : insertId;
}

async function createAccrualForEvent(
    { eventId, projectId, agentId, amountRub, period, notes, status = 'pending' },
    trx = knex
) {
    const [id] = await trx('commission_accruals').insert({
        project_id: projectId,
        event_id: eventId,
        agent_id: agentId,
        amount_rub: amountRub,
        status,
        period: period || null,
        notes: notes || null,
        created_at: new Date(),
        updated_at: new Date(),
    });
    return typeof id === 'object' ? id.id : id;
}

function currentPeriodYYYYMM(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

async function maybeRecordSubagentEvent({ projectSettings, projectId, subagentId, parentAgentId, eventType, extra = {} }) {
    const rules = getCommissionRulesSettings(projectSettings);
    if (rules.enabled !== true && eventType !== 'subagent_registered') {
        /* still log structural events */
    }

    const beneficiary = parentAgentId ? Number(parentAgentId) : null;
    if (!beneficiary) return null;

    return recordCommissionEvent({
        projectId,
        eventType,
        agentId: Number(subagentId),
        beneficiaryAgentId: beneficiary,
        subagentId: Number(subagentId),
        metadata: extra,
    });
}

async function listEvents(projectId, filters = {}) {
    const q = knex('commission_events').where('project_id', projectId).orderBy('occurred_at', 'desc');
    if (filters.event_type) q.where('event_type', filters.event_type);
    if (filters.agent_id) q.where('agent_id', filters.agent_id);
    if (filters.beneficiary_agent_id) q.where('beneficiary_agent_id', filters.beneficiary_agent_id);
    if (filters.from) q.where('occurred_at', '>=', new Date(filters.from));
    if (filters.to) q.where('occurred_at', '<=', new Date(filters.to));
    const limit = Math.min(Number(filters.limit) || 100, 500);
    return q.limit(limit);
}

async function listAccruals(projectId, filters = {}) {
    const q = knex('commission_accruals').where('project_id', projectId).orderBy('created_at', 'desc');
    if (filters.status) q.where('status', filters.status);
    if (filters.period) q.where('period', filters.period);
    if (filters.agent_id) q.where('agent_id', filters.agent_id);
    const limit = Math.min(Number(filters.limit) || 100, 500);
    return q.limit(limit);
}

async function updateAccrualStatus(id, projectId, status, notes) {
    const allowed = ['pending', 'approved', 'paid', 'cancelled'];
    if (!allowed.includes(status)) {
        throw { status: 400, message: 'Недопустимый status' };
    }
    const patch = { status, updated_at: new Date() };
    if (notes !== undefined) patch.notes = notes;
    const n = await knex('commission_accruals').where({ id, project_id: projectId }).update(patch);
    if (!n) throw { status: 404, message: 'Начисление не найдено' };
    return knex('commission_accruals').where({ id }).first();
}

async function manualPartnerDeal({ projectId, agentId, beneficiaryAgentId, amountRub, externalRef, notes, metadata }) {
    const eventId = await recordCommissionEvent({
        projectId,
        eventType: 'partner_deal_confirmed',
        agentId,
        beneficiaryAgentId: beneficiaryAgentId || null,
        amountRub,
        externalRef,
        metadata,
    });
    const accrualAgentId = beneficiaryAgentId || agentId;
    const accrualId = await createAccrualForEvent({
        eventId,
        projectId,
        agentId: accrualAgentId,
        amountRub: amountRub || 0,
        period: currentPeriodYYYYMM(),
        notes,
        status: 'pending',
    });
    return { event_id: eventId, accrual_id: accrualId };
}

module.exports = {
    recordCommissionEvent,
    createAccrualForEvent,
    currentPeriodYYYYMM,
    maybeRecordSubagentEvent,
    listEvents,
    listAccruals,
    updateAccrualStatus,
    manualPartnerDeal,
};
