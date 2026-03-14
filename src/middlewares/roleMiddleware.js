/**
 * Middleware to restrict access based on user roles
 * @param {...string} roles - Allowed roles (e.g. 'super_admin', 'admin', 'agent')
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const role = req.user.role ? String(req.user.role).toLowerCase() : '';
        const rolesLower = roles.map((r) => String(r).toLowerCase());
        const allowedByRole = rolesLower.includes(role);
        // супер-админ допускается везде, где есть admin или super_admin
        const allowedBySuperAdmin =
            req.user.isSuperAdmin === true && (rolesLower.includes('super_admin') || rolesLower.includes('admin'));

        if (allowedByRole || allowedBySuperAdmin) {
            return next();
        }

        return res.status(403).json({
            error: 'Forbidden: You do not have permission to perform this action'
        });
    };
};

module.exports = { restrictTo };
