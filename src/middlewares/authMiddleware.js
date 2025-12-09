const authService = require('../services/authService');

/**
 * Authentication middleware
 * Supports both JWT tokens and legacy x-agent-id headers
 */
function authMiddleware(req, res, next) {
    try {
        // Check for Authorization header with Bearer token
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            // JWT authentication
            const token = authHeader.substring(7); // Remove 'Bearer ' prefix
            const decoded = authService.verifyToken(token);

            req.user = {
                id: decoded.agentId || decoded.id,
                email: decoded.email,
                role: decoded.role,
                isAdmin: decoded.role === 'admin'
            };

            return next();
        }

        // Legacy authentication (for backward compatibility)
        const agentId = req.headers['x-agent-id'];
        const role = req.headers['x-role'];

        if (!agentId) {
            return res.status(401).json({
                error: 'Authentication required. Provide Bearer token or x-agent-id header.'
            });
        }

        req.user = {
            id: parseInt(agentId),
            isAdmin: role === 'admin',
            role: role || 'agent'
        };

        next();
    } catch (err) {
        return res.status(401).json({ error: err.message || 'Invalid authentication' });
    }
}

module.exports = authMiddleware;
