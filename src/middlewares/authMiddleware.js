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
                id: decoded.id,
                agentId: decoded.agentId,
                email: decoded.email,
                role: decoded.role,
                isAdmin: decoded.role === 'admin'
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
            return next();
        }

        // 3. Legacy Authentication (x-agent-id)
        // TODO: Disable in production or log warning
        const agentId = req.headers['x-agent-id'];
        const role = req.headers['x-role'];

        if (agentId) {
            req.user = {
                id: parseInt(agentId),
                agentId: parseInt(agentId),
                isAdmin: role === 'admin',
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

module.exports = authMiddleware;
