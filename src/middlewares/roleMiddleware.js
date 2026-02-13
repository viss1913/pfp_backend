/**
 * Middleware to restrict access based on user roles
 * @param {...string} roles - Allowed roles
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden: You do not have permission to perform this action'
            });
        }

        next();
    };
};

module.exports = { restrictTo };
