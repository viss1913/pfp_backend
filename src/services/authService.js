const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

class AuthService {
    /**
     * Login user and return JWT token
     */
    async login(email, password) {
        // Find user by email
        const user = await db('users')
            .where({ email, is_active: true })
            .first();

        if (!user) {
            throw { status: 401, message: 'Invalid credentials' };
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw { status: 401, message: 'Invalid credentials' };
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                agentId: user.agent_id
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                agentId: user.agent_id
            }
        };
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
        const { email, password, name, agentId } = data;

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
            email,
            password_hash: passwordHash,
            name,
            role: 'agent',
            is_active: true
        });

        // Return user without password
        const user = await db('users')
            .where({ id: userId })
            .select('id', 'email', 'name', 'role', 'agent_id as agentId')
            .first();

        return user;
    }
}

module.exports = new AuthService();
