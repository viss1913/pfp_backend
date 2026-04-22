/**
 * Minimal in-memory rate limiter.
 * NOTE: process-local only (resets on restart, not shared across instances).
 */
function simpleRateLimit({ windowMs = 60_000, max = 30, keyFn } = {}) {
    const buckets = new Map();

    const getKey = typeof keyFn === 'function'
        ? keyFn
        : (req) => {
            const ip = req.ip || req.connection?.remoteAddress || 'unknown';
            const projectId = req.projectId || 'no_project';
            return `${ip}:${projectId}`;
        };

    return (req, res, next) => {
        const now = Date.now();
        const key = String(getKey(req));
        const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

        if (now > bucket.resetAt) {
            bucket.count = 0;
            bucket.resetAt = now + windowMs;
        }

        bucket.count += 1;
        buckets.set(key, bucket);

        if (bucket.count > max) {
            const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                error: 'Too many requests',
                retry_after_sec: retryAfterSec
            });
        }

        next();
    };
}

module.exports = simpleRateLimit;

