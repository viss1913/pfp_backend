/**
 * Защита HTTP-cron для макро (Railway Cron / cron-job.org) без JWT.
 * Задайте MACRO_CRON_SECRET в Variables и передавайте:
 *   Header: x-macro-cron-secret: <secret>
 * или Authorization: Bearer <secret>
 */
function macroCronAuthMiddleware(req, res, next) {
    const secret = (process.env.MACRO_CRON_SECRET || '').trim();
    if (!secret) {
        return res.status(503).json({
            success: false,
            message: 'MACRO_CRON_SECRET is not configured on the server',
        });
    }

    const headerSecret = (req.get('x-macro-cron-secret') || '').trim();
    const auth = (req.get('authorization') || '').trim();
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    const provided = headerSecret || bearer;

    if (!provided || provided !== secret) {
        return res.status(401).json({ success: false, message: 'Invalid or missing cron secret' });
    }

    return next();
}

module.exports = macroCronAuthMiddleware;
