const jwt = require('jsonwebtoken');

const PURPOSE = 'constructor_site_report_pdf';

function getJwtSecret() {
    return (process.env.JWT_SECRET || '').trim();
}

/**
 * Публичная база API для абсолютной ссылки на PDF из site-chat (другой домен у фронта).
 * Примеры: https://pfpbackend-production.up.railway.app/api
 * или только origin — тогда добавится /api перед путём маршрута.
 */
function getSiteChatReportPdfPublicBase() {
    const raw = (process.env.PFP_PUBLIC_API_BASE_URL || process.env.APP_PUBLIC_URL || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
    const railway = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim().replace(/\/+$/, '');
    if (railway) {
        const host = railway.replace(/^https?:\/\//, '');
        return `https://${host}`;
    }
    return '';
}

/**
 * JWT для скачивания PDF без логина (site-chat). Короткий срок — держать ссылку приватной.
 */
function signSiteChatReportPdfToken({ clientId, projectId }) {
    const secret = getJwtSecret();
    if (!secret) return null;
    const cid = Number(clientId);
    const pid = Number(projectId);
    if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(pid) || pid <= 0) return null;
    return jwt.sign({ purpose: PURPOSE, clientId: cid, projectId: pid }, secret, { expiresIn: '7d' });
}

function verifySiteChatReportPdfToken(token) {
    const secret = getJwtSecret();
    if (!secret) {
        const err = new Error('JWT_SECRET is not configured');
        err.statusCode = 503;
        throw err;
    }
    let decoded;
    try {
        decoded = jwt.verify(token, secret);
    } catch (e) {
        const err = new Error('Invalid or expired token');
        err.statusCode = 401;
        throw err;
    }
    if (!decoded || decoded.purpose !== PURPOSE) {
        const err = new Error('Invalid token purpose');
        err.statusCode = 401;
        throw err;
    }
    const clientId = Number(decoded.clientId);
    const projectId = Number(decoded.projectId);
    if (!Number.isFinite(clientId) || clientId <= 0 || !Number.isFinite(projectId) || projectId <= 0) {
        const err = new Error('Invalid token payload');
        err.statusCode = 401;
        throw err;
    }
    return { clientId, projectId };
}

/**
 * Абсолютный URL скачивания PDF; null если не задана публичная база или нет секрета.
 */
function buildSiteChatReportPdfUrl(token) {
    if (!token) return null;
    const base = getSiteChatReportPdfPublicBase();
    if (!base) return null;
    const suffix = '/pfp/constructor/site-chat/report-pdf';
    const path = base.endsWith('/api') ? `${base}${suffix}` : `${base}/api${suffix}`;
    return `${path}?t=${encodeURIComponent(token)}`;
}

module.exports = {
    PURPOSE,
    signSiteChatReportPdfToken,
    verifySiteChatReportPdfToken,
    buildSiteChatReportPdfUrl,
    getSiteChatReportPdfPublicBase,
};
