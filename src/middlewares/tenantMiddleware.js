const projectService = require('../services/projectService');

/**
 * Middleware to identify project by Public Key in headers
 */
const tenantMiddleware = async (req, res, next) => {
    // Priority 1: Authenticated User's Project (Highest security)
    if (req.user && req.user.projectId) {
        req.projectId = req.user.projectId;
        console.log(`[TenantMiddleware] Project set to ${req.projectId} from authenticated user ${req.user.id}`);
        return next();
    }

    // Priority 2: Public Key Header (For public/partner endpoints)
    const projectKey = req.headers['x-project-key'];

    if (!projectKey) {
        return next();
    }

    try {
        const project = await projectService.getProjectByPublicKey(projectKey);

        if (!project) {
            return res.status(404).json({ error: 'Project not found or inactive' });
        }

        // Attach project info to request
        req.project = project;
        req.projectId = project.id;
        console.log(`[TenantMiddleware] Project set to ${req.projectId} from header key`);

        next();
    } catch (err) {
        console.error('Tenant middleware error:', err);
        res.status(500).json({ error: 'Internal server error during project identification' });
    }
};

module.exports = tenantMiddleware;
