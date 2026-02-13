const projectService = require('../services/projectService');

/**
 * Middleware to identify project by Public Key in headers
 */
const tenantMiddleware = async (req, res, next) => {
    const projectKey = req.headers['x-project-key'];
    const isAdmin = req.user && (req.user.isAdmin || req.user.isSuperAdmin);

    // Priority 1: Public Key Header (ONLY if user is Admin OR if it's a public request)
    // If it's a regular agent, we PREFER their own projectId for security.
    // If it's an admin, they can switch project context via the header.
    if (projectKey && (isAdmin || !req.user)) {
        try {
            const project = await projectService.getProjectByPublicKey(projectKey);
            if (project) {
                req.project = project;
                req.projectId = project.id;
                console.log(`[TenantMiddleware] Project set to ${req.projectId} from header (Admin/Public override)`);
                return next();
            }
        } catch (err) {
            console.error('[TenantMiddleware] Header key lookup failed:', err.message);
        }
    }

    // Priority 2: Authenticated User's Project (Strict isolation for regular agents)
    if (req.user && req.user.projectId) {
        req.projectId = req.user.projectId;
        console.log(`[TenantMiddleware] Project set to ${req.projectId} from authenticated user token`);
        return next();
    }

    // Priority 3: Public Fallback for Header (if not handled above)
    if (projectKey && !req.projectId) {
        try {
            const project = await projectService.getProjectByPublicKey(projectKey);
            if (project) {
                req.project = project;
                req.projectId = project.id;
                console.log(`[TenantMiddleware] Project set to ${req.projectId} from header (Fallback)`);
            }
        } catch (err) {
            console.error('[TenantMiddleware] Fallback lookup failed:', err.message);
        }
    }

    next();
};

module.exports = tenantMiddleware;
