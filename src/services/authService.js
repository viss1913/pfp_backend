const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const emailService = require('./emailService');
const projectService = require('./projectService');
const smmService = require('./smmService');
const {
    parsePartnerAgentIdFromInput,
    isPartnerAgentIdRequired,
    assertPartnerAgentIdAvailable,
} = require('../utils/partnerAgentId');
const { parseProjectSettings, getAgentNetworkSettings } = require('../utils/projectSettings');
const agentNetworkService = require('./agentNetworkService');
const commissionService = require('./commissionService');

if (!process.env.JWT_SECRET) {
    console.warn('CRITICAL WARNING: JWT_SECRET environment variable is not set!');
}
const JWT_SECRET = process.env.JWT_SECRET; // Must be provided via environment
const JWT_EXPIRES_IN = '24h';
const VERIFICATION_CODE_TTL_MINUTES = 10;

function maskEmailForLog(email) {
    if (!email || typeof email !== 'string') return '[unknown]';
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    const prefix = local.length <= 2 ? '*' : `${local.slice(0, 2)}***`;
    return `${prefix}${domain}`;
}

class AuthService {
    /**
     * Login user and return JWT token
     */
    async login(email, password) {
        // Find user and agent info by email
        const user = await db('users')
            .leftJoin('agents', 'users.agent_id', 'agents.id')
            .where({ 'users.email': email, 'users.is_active': true })
            .select('users.*', 'agents.uuid as agent_uuid')
            .first();

        if (!user) {
            throw { status: 401, message: 'Invalid credentials' };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw { status: 401, message: 'Invalid credentials' };
        }

        const resolutProjectId = Number(process.env.RESOLUT_PROJECT_ID || 0);
        if (resolutProjectId && user.role === 'agent' && Number(user.project_id) === resolutProjectId) {
            const resolutService = require('./resolutService');
            const resolutSessionStore = require('./resolutSessionStore');
            const sessionKey = await resolutService.exchangePasswordForSessionKey(
                user.project_id,
                email,
                password
            );
            resolutSessionStore.set(user.id, sessionKey);
            console.info(
                `[AuthService] Resolut bearer cached user_id=${user.id} project_id=${user.project_id} email=${maskEmailForLog(email)}`
            );
        }

        // Generate JWT token payload
        const payload = {
            id: user.agent_uuid, // UUID for SMM AI
            user_id: user.id,   // Original ID for PFP
            email: user.email,
            role: user.role,
            agentId: user.agent_id,
            projectId: user.project_id
        };

        // For client role: add clientId to payload
        if (user.role === 'client') {
            const client = await db('clients').where({ user_id: user.id }).first();
            if (client) {
                payload.clientId = client.id;
            }
        }

        const token = jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const responseUser = {
            id: user.id,
            uuid: user.agent_uuid, // Added UUID for frontend
            email: user.email,
            name: user.name,
            role: user.role,
            agentId: user.agent_id,
            projectId: user.project_id
        };

        // Add clientId to response for client role
        if (payload.clientId) {
            responseUser.clientId = payload.clientId;
        }

        return { token, user: responseUser };
    }

    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (err) {
            throw { status: 401, message: 'Invalid or expired token' };
        }
    }

    /**
     * Register new user (agent)
     */
    async register(data) {
        const { email, password, name, agentId, projectId } = data;

        // Check if user already exists
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'User with this email already exists' };
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const [userId] = await db('users').insert({
            agent_id: agentId,
            project_id: projectId || null,
            email,
            password_hash: passwordHash,
            name,
            role: 'agent',
            is_active: true
        });

        // Return user without password
        const user = await db('users')
            .where({ id: userId })
            .select('id', 'email', 'name', 'role', 'agent_id as agentId', 'project_id as projectId')
            .first();

        return user;
    }

    // ─── Client Registration (2-step with email verification) ───

    /**
     * Step 1: Initiate client registration — send verification code to email
     * @param {{ email: string, name: string, project_key: string }} data
     */
    async initiateClientRegistration({ email, name, project_key }) {
        // Check if user already exists
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'Пользователь с таким email уже существует' };
        }

        // Find project by public key
        const project = await projectService.getProjectByPublicKey(project_key);
        if (!project) {
            throw { status: 400, message: 'Неверный ключ проекта' };
        }

        // Generate 6-digit code
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);

        // Invalidate any previous codes for this email
        await db('email_verifications')
            .where({ email, purpose: 'client_register', verified: false })
            .del();

        // Save verification record
        await db('email_verifications').insert({
            email,
            code,
            project_id: project.id,
            name,
            purpose: 'client_register',
            expires_at: expiresAt,
            verified: false,
        });

        // Send email
        await emailService.sendVerificationCode(email, code, { purpose: 'client' });

        console.log(`[AuthService] Verification code sent to ${email} for project ${project.id}`);

        return {
            message: 'Код подтверждения отправлен на вашу почту',
            email,
            expires_in_minutes: VERIFICATION_CODE_TTL_MINUTES
        };
    }

    /**
     * Step 2: Verify code and create client account
     * @param {{ email: string, code: string, password: string }} data
     */
    async verifyAndCreateClient({ email, code, password }) {
        // Find matching verification record
        const verification = await db('email_verifications')
            .where({ email, code, purpose: 'client_register', verified: false })
            .where('expires_at', '>', new Date())
            .orderBy('created_at', 'desc')
            .first();

        if (!verification) {
            throw { status: 400, message: 'Неверный или истёкший код подтверждения' };
        }

        // Double-check user doesn't exist (race condition guard)
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'Пользователь с таким email уже существует' };
        }

        // Mark code as verified
        await db('email_verifications')
            .where({ id: verification.id })
            .update({ verified: true });

        // Parse name into first/last
        const nameParts = (verification.name || 'Client').trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user + client in a transaction
        const result = await db.transaction(async (trx) => {
            // Create user
            const [userId] = await trx('users').insert({
                project_id: verification.project_id,
                email,
                password_hash: passwordHash,
                name: verification.name || 'Client',
                role: 'client',
                is_active: true
            });

            // Create client record linked to user
            const [clientId] = await trx('clients').insert({
                user_id: userId,
                project_id: verification.project_id,
                first_name: firstName,
                last_name: lastName || firstName,
                email
            });

            return { userId, clientId };
        });

        // Generate JWT token (auto-login after registration)
        const payload = {
            user_id: result.userId,
            email,
            role: 'client',
            clientId: result.clientId,
            projectId: verification.project_id
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        console.log(`[AuthService] Client account created: userId=${result.userId}, clientId=${result.clientId}`);

        return {
            token,
            user: {
                id: result.userId,
                email,
                name: verification.name,
                role: 'client',
                clientId: result.clientId,
                projectId: verification.project_id
            }
        };
    }

    /**
     * Fast Client registration without email verification
     * @param {{ email: string, password: string, project_key: string, name?: string }} data
     */
    async registerFastClient({ email, password, project_key, name }) {
        // Double-check user doesn't exist
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'Пользователь с таким email уже существует' };
        }

        // Find project by public key
        const project = await projectService.getProjectByPublicKey(project_key);
        if (!project) {
            throw { status: 400, message: 'Неверный ключ проекта' };
        }

        // Parse name into first/last
        const clientName = name || 'Client';
        const nameParts = clientName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user + client in a transaction
        const result = await db.transaction(async (trx) => {
            // Create user
            const [userId] = await trx('users').insert({
                project_id: project.id,
                email,
                password_hash: passwordHash,
                name: clientName,
                role: 'client',
                is_active: true
            });

            // Create client record linked to user
            const [clientId] = await trx('clients').insert({
                user_id: userId,
                project_id: project.id,
                first_name: firstName,
                last_name: lastName || firstName,
                email
            });

            return { userId, clientId };
        });

        // Generate JWT token (auto-login after registration)
        const payload = {
            user_id: result.userId,
            email,
            role: 'client',
            clientId: result.clientId,
            projectId: project.id
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        console.log(`[AuthService] Fast Client account created: userId=${result.userId}, clientId=${result.clientId}`);

        return {
            token,
            user: {
                id: result.userId,
                email,
                name: clientName,
                role: 'client',
                clientId: result.clientId,
                projectId: project.id
            }
        };
    }

    /**
     * Step 1: agent registration — send 6-digit code via Resend (from noreply@ verified domain).
     */
    async initiateAgentRegistration(body) {
        const {
            email,
            first_name,
            last_name,
            phone,
            project_key,
            partner_agent_id,
            partner_ref_url,
            ref,
        } = body;

        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'Пользователь с таким email уже существует' };
        }

        const project = await projectService.getProjectByPublicKey(project_key);
        if (!project) {
            throw { status: 400, message: 'Неверный ключ проекта' };
        }

        const settings = parseProjectSettings(project.settings);
        const network = getAgentNetworkSettings(settings);

        if (network.enabled === true && network.require_invite_ref === true && !ref) {
            throw { status: 400, message: 'Регистрация только по приглашению (ref)' };
        }

        let resolvedPartnerId = null;
        const hasPartnerInput =
            (partner_agent_id != null && String(partner_agent_id).trim() !== '') || partner_ref_url;
        if (hasPartnerInput) {
            resolvedPartnerId = parsePartnerAgentIdFromInput({ partner_agent_id, partner_ref_url }, settings);
        } else if (isPartnerAgentIdRequired(settings, 'registration')) {
            throw {
                status: 400,
                message: 'Укажите ID партнёра или ссылку из личного кабинета партнёра',
            };
        }
        if (resolvedPartnerId) {
            await assertPartnerAgentIdAvailable(project.id, resolvedPartnerId);
        }

        let parentAgentId = null;
        if (ref) {
            const parent = await agentNetworkService.resolveParentAgentFromRef(project.id, ref);
            parentAgentId = parent.id;
            await agentNetworkService.assertValidParentAssignment({
                agentId: null,
                parentAgentId,
                projectSettings: settings,
            });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
        const payload = {
            first_name: first_name || null,
            last_name: last_name || null,
            phone: phone != null && String(phone).trim() !== '' ? String(phone).trim() : null,
            partner_agent_id: resolvedPartnerId,
            partner_agent_id_source: partner_ref_url ? 'registration_ref' : resolvedPartnerId ? 'registration_manual' : null,
            parent_agent_id: parentAgentId,
            ref: ref || null,
            registration_attribution: agentNetworkService.buildRegistrationAttribution(body),
        };

        await db('email_verifications')
            .where({ email, purpose: 'agent_register', verified: false })
            .del();

        await db('email_verifications').insert({
            email,
            code,
            project_id: project.id,
            name: [first_name, last_name].filter(Boolean).join(' ').trim() || 'Агент',
            purpose: 'agent_register',
            payload: JSON.stringify(payload),
            expires_at: expiresAt,
            verified: false,
        });

        await emailService.sendVerificationCode(email, code, { purpose: 'agent' });

        return {
            message: 'Код подтверждения отправлен на вашу почту',
            email,
            expires_in_minutes: VERIFICATION_CODE_TTL_MINUTES,
        };
    }

    /**
     * Step 2: verify code and create agent account.
     */
    async verifyAndCreateAgent({ email, code, password }) {
        const verification = await db('email_verifications')
            .where({ email, code, purpose: 'agent_register', verified: false })
            .where('expires_at', '>', new Date())
            .orderBy('created_at', 'desc')
            .first();

        if (!verification) {
            throw { status: 400, message: 'Неверный или истёкший код подтверждения' };
        }

        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'Пользователь с таким email уже существует' };
        }

        let payload = {};
        try {
            payload =
                typeof verification.payload === 'string'
                    ? JSON.parse(verification.payload)
                    : verification.payload || {};
        } catch (_) {
            payload = {};
        }

        await db('email_verifications')
            .where({ id: verification.id })
            .update({ verified: true });

        return this._createAgentAccount({
            email,
            password,
            project_id: verification.project_id,
            first_name: payload.first_name,
            last_name: payload.last_name,
            phone: payload.phone,
            partner_agent_id: payload.partner_agent_id,
            partner_agent_id_source: payload.partner_agent_id_source,
            parent_agent_id: payload.parent_agent_id,
            registration_attribution: payload.registration_attribution,
        });
    }

    /**
     * @deprecated Используйте initiateAgentRegistration + verifyAndCreateAgent
     */
    async registerAgent(body) {
        if (body.code && body.password) {
            return this.verifyAndCreateAgent({
                email: body.email,
                code: body.code,
                password: body.password,
            });
        }
        return this.initiateAgentRegistration(body);
    }

    async _createAgentAccount({
        email,
        password,
        project_id,
        first_name,
        last_name,
        phone,
        partner_agent_id,
        partner_agent_id_source,
        parent_agent_id,
        registration_attribution,
    }) {
        const passwordHash = await bcrypt.hash(password, 10);
        const name = [first_name, last_name].filter(Boolean).join(' ').trim() || 'Агент';
        const agentUuid = crypto.randomUUID();
        const referralSlug = agentNetworkService.generateReferralSlug();

        const result = await db.transaction(async (trx) => {
            const [agentId] = await trx('agents').insert({
                project_id,
                first_name: first_name || null,
                last_name: last_name || null,
                phone: phone || null,
                uuid: agentUuid,
                partner_agent_id: partner_agent_id || null,
                partner_agent_id_source: partner_agent_id ? partner_agent_id_source : null,
                parent_agent_id: parent_agent_id || null,
                referral_slug: referralSlug,
                registration_attribution: registration_attribution
                    ? JSON.stringify(registration_attribution)
                    : null,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
            });
            const aid = typeof agentId === 'object' ? agentId.id : agentId;

            const [userId] = await trx('users').insert({
                agent_id: aid,
                project_id,
                email,
                password_hash: passwordHash,
                name,
                role: 'agent',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
            });
            const uid = typeof userId === 'object' ? userId.id : userId;

            return { userId: uid, agentId: aid, parentAgentId: parent_agent_id };
        });

        if (result.parentAgentId) {
            commissionService
                .recordCommissionEvent({
                    projectId: project_id,
                    eventType: 'subagent_registered',
                    agentId: result.agentId,
                    beneficiaryAgentId: result.parentAgentId,
                    subagentId: result.agentId,
                })
                .catch((err) => console.error('[AuthService] commission subagent_registered failed:', err));
        }

        smmService.syncAgent(result.agentId).catch((err) =>
            console.error('[AuthService] SMM sync after agent registration failed:', err)
        );

        const payload = {
            id: agentUuid,
            user_id: result.userId,
            email,
            role: 'agent',
            agentId: result.agentId,
            projectId: project_id,
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        console.log(
            `[AuthService] Agent registered: userId=${result.userId}, agentId=${result.agentId}, project=${project_id}`
        );

        return {
            token,
            user: {
                id: result.userId,
                email,
                name,
                role: 'agent',
                agentId: result.agentId,
                projectId: project_id,
            },
        };
    }
}

module.exports = new AuthService();

