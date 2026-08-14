const crypto = require('crypto');
const db = require('../config/database');
const projectService = require('./projectService');
const authService = require('./authService');
const { normalizeAgentWebsiteUrl } = require('../utils/clientLandingInviteUrl');
const {
    normalizeRegistrationEmail,
    purgeInactiveUserForEmail,
} = require('../utils/userEmailRegistration');

const SSO_TICKET_TTL_SECONDS = 60;
const IDE_REGISTRATION_SOURCE = 'ide.bank-future.com';

function normalizePhone(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    return s || null;
}

function buildIdeRegistrationAttribution(source) {
    const src = source != null && String(source).trim() !== '' ? String(source).trim() : IDE_REGISTRATION_SOURCE;
    return {
        captured_at: new Date().toISOString(),
        source: src,
        utm_source: src,
        utm_medium: 'ide_provision',
    };
}

/**
 * @param {string} email
 * @param {number} projectId
 */
async function assertEmailNotTakenInOtherProject(email, projectId) {
    const normalized = normalizeRegistrationEmail(email);
    const other = await db('users')
        .where({ email: normalized, is_active: true })
        .whereNot({ project_id: projectId })
        .first();
    if (other) {
        throw {
            status: 409,
            error: 'email_taken',
            message: 'Email уже используется в другом проекте',
        };
    }
}

/**
 * @param {string|null} phone
 * @param {number} projectId
 * @param {number|null} excludeAgentId
 */
async function assertPhoneAvailableInProject(phone, projectId, excludeAgentId = null) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;

    const query = db('agents')
        .where({ project_id: projectId, phone: normalized, is_active: true });
    if (excludeAgentId != null) {
        query.whereNot({ id: excludeAgentId });
    }
    const existing = await query.first();
    if (existing) {
        throw {
            status: 409,
            error: 'phone_taken',
            message: 'Телефон уже используется другим агентом в этом проекте',
        };
    }
}

function buildAgentProfilePatch(body) {
    const patch = {
        first_name: body.first_name != null ? String(body.first_name).trim() || null : null,
        last_name: body.last_name != null ? String(body.last_name).trim() || null : null,
        middle_name: body.middle_name != null ? String(body.middle_name).trim() || null : null,
        phone: normalizePhone(body.phone),
        region: body.region != null ? String(body.region).trim() || null : null,
        updated_at: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(body, 'website_url')) {
        const raw = body.website_url;
        if (raw == null || String(raw).trim() === '') {
            patch.website_url = null;
        } else {
            patch.website_url = normalizeAgentWebsiteUrl(raw);
        }
    }

    return patch;
}

class IdeAgentSsoService {
    /**
     * POST /api/internal/agents/provision
     * @param {object} body
     */
    async provisionAgent(body) {
        if (body.email_verified !== true) {
            throw {
                status: 400,
                error: 'email_not_verified',
                message: 'email_verified: true обязателен для provision из IDE',
            };
        }

        const project = await projectService.getProjectByPublicKey(body.project_key);
        if (!project) {
            throw { status: 400, error: 'invalid_project_key', message: 'Неверный project_key' };
        }

        const normalizedEmail = normalizeRegistrationEmail(body.email);
        if (!normalizedEmail) {
            throw { status: 400, message: 'email обязателен' };
        }

        await assertEmailNotTakenInOtherProject(normalizedEmail, project.id);

        const profilePatch = buildAgentProfilePatch(body);
        await assertPhoneAvailableInProject(profilePatch.phone, project.id);

        const existingUser = await db('users')
            .leftJoin('agents', 'users.agent_id', 'agents.id')
            .where({ 'users.email': normalizedEmail, 'users.project_id': project.id })
            .select('users.*', 'agents.id as linked_agent_id')
            .first();

        if (existingUser?.is_active) {
            const agentId = existingUser.agent_id || existingUser.linked_agent_id;
            if (!agentId) {
                throw { status: 500, message: 'Активный пользователь без профиля агента' };
            }

            await assertPhoneAvailableInProject(profilePatch.phone, project.id, agentId);

            const name = [profilePatch.first_name, profilePatch.last_name].filter(Boolean).join(' ').trim() || existingUser.name;

            await db.transaction(async (trx) => {
                const agentUpdate = { ...profilePatch };
                if (Object.prototype.hasOwnProperty.call(body, 'website_url')) {
                    // keep normalized/null from patch
                } else {
                    delete agentUpdate.website_url;
                }
                await trx('agents').where({ id: agentId, project_id: project.id }).update(agentUpdate);
                await trx('users').where({ id: existingUser.id }).update({
                    name,
                    updated_at: new Date(),
                });
            });

            return {
                ok: true,
                created: false,
                agent: {
                    id: agentId,
                    email: normalizedEmail,
                    projectId: project.id,
                },
            };
        }

        await purgeInactiveUserForEmail(normalizedEmail, project.id);

        if (!body.password || String(body.password).length < 6) {
            throw {
                status: 400,
                message: 'password обязателен при первичном создании агента',
            };
        }

        const websiteUrl = Object.prototype.hasOwnProperty.call(body, 'website_url')
            ? profilePatch.website_url ?? null
            : null;

        const created = await authService._createAgentAccount({
            email: normalizedEmail,
            password: body.password,
            project_id: project.id,
            first_name: profilePatch.first_name,
            last_name: profilePatch.last_name,
            middle_name: profilePatch.middle_name,
            phone: profilePatch.phone,
            region: profilePatch.region,
            website_url: websiteUrl,
            registration_attribution: buildIdeRegistrationAttribution(body.source),
            skipToken: true,
        });

        return {
            ok: true,
            created: true,
            agent: {
                id: created.agentId,
                email: normalizedEmail,
                projectId: project.id,
            },
        };
    }

    /**
     * POST /api/internal/agents/sso-ticket
     * @param {{ email: string, project_key: string, return_path?: string }} body
     */
    async createSsoTicket(body) {
        const project = await projectService.getProjectByPublicKey(body.project_key);
        if (!project) {
            throw { status: 400, error: 'invalid_project_key', message: 'Неверный project_key' };
        }

        const normalizedEmail = normalizeRegistrationEmail(body.email);
        const user = await db('users')
            .leftJoin('agents', 'users.agent_id', 'agents.id')
            .where({
                'users.email': normalizedEmail,
                'users.project_id': project.id,
                'users.is_active': true,
                'users.role': 'agent',
            })
            .select('users.id as user_id', 'users.agent_id', 'agents.id as agent_row_id')
            .first();

        if (!user?.agent_id) {
            throw {
                status: 404,
                error: 'agent_not_found',
                message: 'Агент не найден. Сначала выполните provision.',
            };
        }

        const returnPathRaw = body.return_path != null ? String(body.return_path).trim() : '/cabinet';
        const returnPath = returnPathRaw.startsWith('/') ? returnPathRaw : `/${returnPathRaw}`;

        const ticket = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SSO_TICKET_TTL_SECONDS * 1000);

        await db('agent_sso_tickets').insert({
            ticket,
            user_id: user.user_id,
            agent_id: user.agent_id,
            project_id: project.id,
            email: normalizedEmail,
            return_path: returnPath,
            expires_at: expiresAt,
            used_at: null,
            created_at: new Date(),
        });

        return {
            ticket,
            expires_in: SSO_TICKET_TTL_SECONDS,
        };
    }

    /**
     * POST /api/auth/sso/consume
     * @param {{ ticket: string }} body
     */
    async consumeSsoTicket(body) {
        const raw = String(body.ticket || '').trim();
        if (!raw) {
            throw { status: 400, message: 'ticket обязателен' };
        }

        const row = await db('agent_sso_tickets').where({ ticket: raw }).first();
        if (!row) {
            throw { status: 400, message: 'Недействительный или просроченный ticket' };
        }

        const now = new Date();
        if (row.used_at != null || (row.expires_at && new Date(row.expires_at) <= now)) {
            throw { status: 400, message: 'Недействительный или просроченный ticket' };
        }

        const updated = await db('agent_sso_tickets')
            .where({ id: row.id, used_at: null })
            .where('expires_at', '>', now)
            .update({ used_at: now });

        if (!updated) {
            throw { status: 400, message: 'Недействительный или просроченный ticket' };
        }

        return authService.issueTokenForUserId(row.user_id);
    }
}

module.exports = new IdeAgentSsoService();
module.exports._test = {
    buildAgentProfilePatch,
    normalizePhone,
    SSO_TICKET_TTL_SECONDS,
};
