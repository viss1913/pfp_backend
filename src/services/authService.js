const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const emailService = require('./emailService');
const projectService = require('./projectService');
const smmService = require('./smmService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const VERIFICATION_CODE_TTL_MINUTES = 10;

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
            .where({ email, verified: false })
            .del();

        // Save verification record
        await db('email_verifications').insert({
            email,
            code,
            project_id: project.id,
            name,
            expires_at: expiresAt,
            verified: false
        });

        // Send email
        await emailService.sendVerificationCode(email, code);

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
            .where({ email, code, verified: false })
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
     * Self-registration of agent (no email verification).
     * Body: email, password, first_name, last_name, project_key.
     */
    async registerAgent({ email, password, first_name, last_name, project_key }) {
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw { status: 400, message: 'Пользователь с таким email уже существует' };
        }

        const project = await projectService.getProjectByPublicKey(project_key);
        if (!project) {
            throw { status: 400, message: 'Неверный ключ проекта' };
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const name = [first_name, last_name].filter(Boolean).join(' ').trim() || 'Агент';
        const agentUuid = crypto.randomUUID();

        const result = await db.transaction(async (trx) => {
            const [agentId] = await trx('agents').insert({
                project_id: project.id,
                first_name: first_name || null,
                last_name: last_name || null,
                uuid: agentUuid,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });
            const aid = typeof agentId === 'object' ? agentId.id : agentId;

            const [userId] = await trx('users').insert({
                agent_id: aid,
                project_id: project.id,
                email,
                password_hash: passwordHash,
                name,
                role: 'agent',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });
            const uid = typeof userId === 'object' ? userId.id : userId;

            return { userId: uid, agentId: aid };
        });

        smmService.syncAgent(result.agentId).catch(err => console.error('[AuthService] SMM sync after agent registration failed:', err));

        const payload = {
            id: agentUuid,
            user_id: result.userId,
            email,
            role: 'agent',
            agentId: result.agentId,
            projectId: project.id
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        console.log(`[AuthService] Agent self-registered: userId=${result.userId}, agentId=${result.agentId}, project=${project.id}`);

        return {
            token,
            user: {
                id: result.userId,
                email,
                name,
                role: 'agent',
                agentId: result.agentId,
                projectId: project.id
            }
        };
    }
}

module.exports = new AuthService();

