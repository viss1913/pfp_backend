const crypto = require('crypto');

/**
 * Server-to-server auth for IDE (ide-api) → pfp-api internal routes.
 * Header: Authorization: Bearer <PFP_IDE_SERVICE_KEY>
 */
function pfpIdeServiceKeyAuthMiddleware(req, res, next) {
    const secret = (process.env.PFP_IDE_SERVICE_KEY || '').trim();
    if (!secret) {
        return res.status(503).json({
            error: 'service_unconfigured',
            message: 'PFP_IDE_SERVICE_KEY is not configured on the server',
        });
    }

    const auth = (req.get('authorization') || '').trim();
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    const provided = bearer;

    if (!provided) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Invalid or missing service key',
        });
    }

    const expected = Buffer.from(secret, 'utf8');
    const actual = Buffer.from(provided, 'utf8');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Invalid or missing service key',
        });
    }

    return next();
}

module.exports = pfpIdeServiceKeyAuthMiddleware;
