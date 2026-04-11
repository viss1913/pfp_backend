const authService = require('../services/authService');
const apiKeyService = require('../services/apiKeyService');

/**
 * Authentication middleware
 * Supports:
 * 1. JWT tokens (Bearer check) -> Frontend (Agents)
 * 2. API Keys (x-api-key) -> Partners/Integrations
 * 3. Legacy (x-agent-id) -> Deprecated (Dev only recommended)
 */
async function authMiddleware(req, res, next) {
    try {
        // 1. Check for Authorization header (JWT)
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = authService.verifyToken(token);

            req.user = {
                id: decoded.user_id || decoded.id, // Support new (user_id) and legacy (id) formats
                agentId: decoded.agentId,
                projectId: decoded.projectId,
                uuid: decoded.id, // The UUID for SMM integration
                email: decoded.email,
                role: decoded.role,
                isAdmin: ['admin', 'super_admin'].includes(decoded.role),
                isSuperAdmin: decoded.role === 'super_admin',
                clientId: decoded.clientId || null // For client role
            };

            return next();
        }

        // 2. Check for API Key (x-api-key)
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            const agentContext = await apiKeyService.validateKey(apiKey);
            if (!agentContext) {
                return res.status(401).json({ error: 'Invalid API Key' });
            }
            req.user = agentContext;
            req.projectId = agentContext.projectId; // API Keys are also tied to projects
            return next();
        }

        // 3. Legacy Authentication (x-agent-id)
        // TODO: Disable in production or log warning
        const agentId = req.headers['x-agent-id'];
        const projectContextId = req.headers['x-project-id']; // For testing
        const role = req.headers['x-role'];

        if (agentId) {
            req.user = {
                id: parseInt(agentId),
                agentId: parseInt(agentId),
                projectId: projectContextId ? parseInt(projectContextId) : null,
                isAdmin: ['admin', 'super_admin'].includes(role),
                isSuperAdmin: role === 'super_admin',
                role: role || 'agent',
                isLegacy: true
            };
            return next();
        }

        // If no auth method found
        return res.status(401).json({
            error: 'Authentication required. Provide Bearer token or x-api-key.'
        });

    } catch (err) {
        console.error('Auth Middleware Error:', err);
        return res.status(401).json({ error: 'Invalid authentication' });
    }
}

/**
 * If Authorization: Bearer is present, verifies JWT and sets req.user (same shape as authMiddleware).
 * If absent, continues without req.user so tenantMiddleware can still resolve project via x-project-key.
 * Invalid/expired Bearer → 401.
 */
async function optionalAuthMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = authService.verifyToken(token);
            req.user = {
                id: decoded.user_id || decoded.id,
                agentId: decoded.agentId,
                projectId: decoded.projectId,
                uuid: decoded.id,
                email: decoded.email,
                role: decoded.role,
                isAdmin: ['admin', 'super_admin'].includes(decoded.role),
                isSuperAdmin: decoded.role === 'super_admin',
                clientId: decoded.clientId || null
            };
        }
        return next();
    } catch (err) {
        console.error('Optional Auth Middleware Error:', err);
        return res.status(401).json({ error: 'Invalid authentication' });
    }
}

authMiddleware.optionalAuthMiddleware = optionalAuthMiddleware;
module.exports = authMiddleware;
