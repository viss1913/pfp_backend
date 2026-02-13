const projectService = require('../services/projectService');

/**
 * Middleware to identify project by Public Key in headers
 */
const tenantMiddleware = async (req, res, next) => {
    const projectKey = req.headers['x-project-key'];

    if (!projectKey) {
        // Fallback to user's project if authenticated
        if (req.user && req.user.projectId) {
            req.projectId = req.user.projectId;
        }
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

        next();
    } catch (err) {
        console.error('Tenant middleware error:', err);
        res.status(500).json({ error: 'Internal server error during project identification' });
    }
};

module.exports = tenantMiddleware;
