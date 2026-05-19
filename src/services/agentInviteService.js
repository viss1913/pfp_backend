const crypto = require('crypto');
const db = require('../config/database');
const authService = require('./authService');
const emailService = require('./emailService');
const {
    buildFamilyOfficeActivateUrl,
    getInviteTokenTtlDays,
} = require('../utils/familyOfficeActivateUrl');
const { withNormalizedBirthDate } = require('../utils/normalizeMysqlDate');
const { normalizeGender } = require('../utils/normalizeGender');

function buildProvisionAttribution(inviterAgent, sourceNote) {
    const out = {
        captured_at: new Date().toISOString(),
        utm_source: 'pfp',
        utm_medium: 'family_office_invite',
        utm_campaign: 'subagent_provision',
    };
    if (inviterAgent?.partner_agent_id) {
        out.utm_partner_finam = String(inviterAgent.partner_agent_id).trim();
    }
    if (sourceNote) out.source_note = String(sourceNote).trim();
    return out;
}

class AgentInviteService {
    /**
     * @param {number} inviterAgentId
     * @param {number} projectId
     * @param {object} body
     * @param {object} inviterAgent row with first_name, last_name, email, partner_agent_id, email_corp
     */
    async provisionFamilyOfficeInvite(inviterAgentId, projectId, body, inviterAgent) {
        const email = String(body.email || '')
            .trim()
            .toLowerCase();
        if (!email) {
            throw { status: 400, message: 'Укажите email' };
        }

        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 409, message: 'Пользователь с таким email уже существует' };
        }

        const profile = withNormalizedBirthDate({
            first_name: body.first_name || null,
            last_name: body.last_name || null,
            middle_name: body.middle_name || null,
            phone: body.phone != null ? String(body.phone).trim() : null,
            birth_date: body.birth_date || null,
            gender: normalizeGender(body.gender),
        });

        const placeholderPassword = crypto.randomBytes(32).toString('hex');

        const created = await authService._createAgentAccount({
            email,
            password: placeholderPassword,
            project_id: projectId,
            first_name: profile.first_name,
            last_name: profile.last_name,
            middle_name: profile.middle_name,
            phone: profile.phone,
            birth_date: profile.birth_date,
            gender: profile.gender,
            partner_agent_id: null,
            partner_agent_id_source: null,
            parent_agent_id: inviterAgentId,
            registration_attribution: buildProvisionAttribution(inviterAgent, body.source_note),
            skipToken: true,
        });

        const tokenValue = crypto.randomBytes(32).toString('hex');
        const ttlDays = getInviteTokenTtlDays();
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

        await db('agent_invite_tokens').insert({
            token: tokenValue,
            user_id: created.userId,
            agent_id: created.agentId,
            project_id: projectId,
            invited_by_agent_id: inviterAgentId,
            expires_at: expiresAt,
            used_at: null,
            created_at: new Date(),
        });

        const activateUrl = buildFamilyOfficeActivateUrl({ token: tokenValue });
        const inviterFullName =
            [inviterAgent?.first_name, inviterAgent?.last_name].filter(Boolean).join(' ').trim() ||
            'Ваш куратор';

        await emailService.sendFamilyOfficeInviteEmail({
            to: email,
            activateUrl,
            inviterFullName,
            inviterEmail: inviterAgent?.email,
            inviterAgent: {
                id: inviterAgentId,
                email: inviterAgent?.email,
                email_corp: inviterAgent?.email_corp,
            },
            inviteeFirstName: profile.first_name,
        });

        return {
            message: 'Приглашение в Family Office отправлено',
            agent_id: created.agentId,
            email,
            expires_at: expiresAt.toISOString(),
        };
    }
}

module.exports = new AgentInviteService();
