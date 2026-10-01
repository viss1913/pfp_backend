const jwt = require('jsonwebtoken');

const PURPOSE = 'mcp_plan_pdf';

function signMcpPdfToken({ clientId, projectId }) {
    const secret = (process.env.JWT_SECRET || '').trim();
    if (!secret) return null;
    const cid = Number(clientId);
    const pid = Number(projectId);
    if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(pid) || pid <= 0) return null;
    return jwt.sign({ purpose: PURPOSE, clientId: cid, projectId: pid }, secret, { expiresIn: '7d' });
}

function verifyMcpPdfToken(token) {
    const secret = (process.env.JWT_SECRET || '').trim();
    if (!secret) {
        const err = new Error('JWT_SECRET is not configured');
        err.statusCode = 503;
        throw err;
    }
    let decoded;
    try {
        decoded = jwt.verify(String(token || ''), secret);
    } catch (e) {
        const err = new Error('Ссылка на PDF недействительна или истекла');
        err.statusCode = 401;
        throw err;
    }
    if (!decoded || decoded.purpose !== PURPOSE) {
        const err = new Error('Ссылка на PDF недействительна');
        err.statusCode = 401;
        throw err;
    }
    return { clientId: Number(decoded.clientId), projectId: Number(decoded.projectId) };
}

function buildMcpPdfUrl(token, publicBase) {
    if (!token) return null;
    const query = `t=${encodeURIComponent(token)}`;
    const base = String(publicBase || '').trim().replace(/\/+$/, '');
    if (!base) return `/api/client/mcp/pdf?${query}`;
    const root = base.endsWith('/api') ? base : `${base}/api`;
    return `${root}/client/mcp/pdf?${query}`;
}

function requestApiBase(req) {
    const env = (process.env.PFP_PUBLIC_API_BASE_URL || process.env.APP_PUBLIC_URL || '').trim();
    if (env) return env.replace(/\/+$/, '');
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('host');
    if (!host) return '';
    return `${proto}://${host}/api`;
}

module.exports = {
    signMcpPdfToken,
    verifyMcpPdfToken,
    buildMcpPdfUrl,
    requestApiBase,
};
