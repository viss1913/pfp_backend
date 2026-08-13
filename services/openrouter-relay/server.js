const crypto = require('crypto');
const express = require('express');
const axios = require('axios');

const PORT = Number(process.env.PORT || 8080);
const RELAY_SECRET = String(process.env.OPENROUTER_RELAY_SECRET || '').trim();
const OPENROUTER_API_KEY = String(process.env.OPENROUTER_API_KEY || '').trim();
const OPENROUTER_BASE = String(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const ALLOWED_IPS = String(process.env.RELAY_ALLOWED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const MAX_BODY_MB = Math.max(1, Number(process.env.RELAY_MAX_BODY_MB || 8));

if (!OPENROUTER_API_KEY) {
    console.error('[openrouter-relay] FATAL: OPENROUTER_API_KEY is not set');
    process.exit(1);
}
if (!RELAY_SECRET) {
    console.warn('[openrouter-relay] WARN: OPENROUTER_RELAY_SECRET is empty — relay accepts any Bearer token');
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket.remoteAddress || '';
}

function ipAllowed(req) {
    if (!ALLOWED_IPS.length) return true;
    const ip = clientIp(req);
    return ALLOWED_IPS.some((allowed) => ip.includes(allowed));
}

function authOk(req) {
    if (!RELAY_SECRET) return true;
    const auth = String(req.headers.authorization || '');
    if (auth === `Bearer ${RELAY_SECRET}`) return true;
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token.length !== RELAY_SECRET.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(RELAY_SECRET));
    } catch {
        return false;
    }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: `${MAX_BODY_MB}mb` }));

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'openrouter-relay' });
});

app.post('/v1/chat/completions', async (req, res) => {
    if (!ipAllowed(req)) {
        return res.status(403).json({ error: 'IP not allowed', ip: clientIp(req) });
    }
    if (!authOk(req)) {
        return res.status(401).json({ error: 'Unauthorized relay token' });
    }

    const stream = Boolean(req.body && req.body.stream);
    const timeout = Number(process.env.RELAY_TIMEOUT_MS || (stream ? 180000 : 60000));

    try {
        const upstream = await axios.post(`${OPENROUTER_BASE}/chat/completions`, req.body, {
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers['http-referer'] || 'https://pfp-api.bank-future.com',
                'X-Title': req.headers['x-title'] || 'PFP OpenRouter Relay',
            },
            responseType: stream ? 'stream' : 'json',
            timeout,
            validateStatus: () => true,
        });

        if (stream) {
            res.status(upstream.status);
            res.setHeader('Content-Type', upstream.headers['content-type'] || 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            upstream.data.pipe(res);
            upstream.data.on('error', (err) => {
                console.error('[openrouter-relay] stream pipe error:', err.message || err);
                if (!res.headersSent) res.status(502);
                res.end();
            });
            return;
        }

        return res.status(upstream.status).json(upstream.data);
    } catch (err) {
        console.error('[openrouter-relay] upstream error:', err.message || err);
        const status = err.response?.status || 502;
        return res.status(status).json({
            error: 'Relay upstream failed',
            message: err.message || String(err),
            upstream: err.response?.data || null,
        });
    }
});

app.listen(PORT, () => {
    console.log(
        `[openrouter-relay] listening on :${PORT} → ${OPENROUTER_BASE} allowlist=${ALLOWED_IPS.length ? ALLOWED_IPS.join(',') : 'any'}`
    );
});
