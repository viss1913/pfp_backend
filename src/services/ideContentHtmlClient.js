/**
 * HTTP client for IDE Content HTML API (server-to-server).
 */
const axios = require('axios');

const TURN_TIMEOUT_MS = Number(process.env.IDE_CONTENT_HTML_TURN_TIMEOUT_MS) || 600_000;
const DEFAULT_TEMPLATE_ID = 'finam-a4-portrait-light';
const DEFAULT_CONSTRAINTS = {
    base_template_id: DEFAULT_TEMPLATE_ID,
    page_count: 1,
    preserve_template_chrome: true,
    preserve_attributes: ['data-cta-slot'],
    language: 'ru',
};

function getBaseUrl() {
    const raw = (process.env.IDE_CONTENT_HTML_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!raw) {
        const err = new Error('IDE_CONTENT_HTML_BASE_URL is not configured');
        err.statusCode = 503;
        throw err;
    }
    return `${raw}/v1/content-html`;
}

function getServiceKey() {
    const key = (process.env.IDE_CONTENT_FACTORY_SERVICE_KEY || '').trim();
    if (!key) {
        const err = new Error('IDE_CONTENT_FACTORY_SERVICE_KEY is not configured');
        err.statusCode = 503;
        throw err;
    }
    return key;
}

function authHeaders() {
    const key = getServiceKey();
    return {
        Authorization: `Bearer ${key}`,
        'X-IDE-Service-Key': key,
        'Content-Type': 'application/json',
    };
}

function mapAxiosError(error) {
    if (error.response) {
        const err = new Error(
            error.response.data?.message ||
                error.response.data?.error ||
                error.message ||
                'IDE Content HTML API error',
        );
        err.statusCode = error.response.status;
        err.code = error.response.data?.error;
        err.details = error.response.data;
        return err;
    }
    if (error.code === 'ECONNABORTED') {
        const err = new Error('IDE Content HTML API timeout');
        err.statusCode = 504;
        return err;
    }
    return error;
}

async function request(method, path, { data, params, timeout = 120_000, responseType } = {}) {
    try {
        const response = await axios({
            method,
            url: `${getBaseUrl()}${path}`,
            headers: authHeaders(),
            data,
            params,
            timeout,
            responseType,
            validateStatus: (s) => s >= 200 && s < 300,
        });
        return response.data;
    } catch (error) {
        throw mapAxiosError(error);
    }
}

function parseSseEvents(buffer) {
    const events = [];
    const blocks = String(buffer).split(/\n\n+/);
    for (const block of blocks) {
        const lines = block.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (data) {
            try {
                events.push({ event, data: JSON.parse(data) });
            } catch {
                events.push({ event, data: { raw: data } });
            }
        }
    }
    return events;
}

function pipeSseStream(stream, res) {
    return new Promise((resolve, reject) => {
        let buf = '';
        let resultPayload = null;
        let errorPayload = null;

        stream.on('data', (chunk) => {
            const s = chunk.toString();
            buf += s;
            if (res && !res.writableEnded) {
                res.write(chunk);
            }
        });

        stream.on('end', () => {
            const events = parseSseEvents(buf);
            for (const ev of events) {
                if (ev.event === 'result') resultPayload = ev.data;
                if (ev.event === 'error') errorPayload = ev.data;
            }
            if (errorPayload) {
                const err = new Error(errorPayload.message || errorPayload.error || 'IDE turn failed');
                err.statusCode = errorPayload.error === 'cta_slot_removed' ? 422 : 502;
                err.code = errorPayload.error;
                err.details = errorPayload;
                reject(err);
                return;
            }
            if (!resultPayload) {
                const err = new Error('IDE stream ended without result event');
                err.statusCode = 502;
                reject(err);
                return;
            }
            resolve(resultPayload);
        });

        stream.on('error', (e) => reject(mapAxiosError(e)));
    });
}

async function health() {
    return request('GET', '/health', { timeout: 15_000 });
}

async function listTemplates() {
    return request('GET', '/templates', { timeout: 30_000 });
}

async function getTemplate(templateId) {
    return request('GET', `/templates/${encodeURIComponent(templateId)}`, { timeout: 30_000 });
}

async function getTemplateHtml(templateId) {
    return request('GET', `/templates/${encodeURIComponent(templateId)}/html`, { timeout: 60_000 });
}

async function createSession(body = {}) {
    const payload = {
        title: body.title || null,
        brief: body.brief || null,
        external_ref: body.external_ref || null,
        generate: body.generate !== false,
        constraints: body.constraints || DEFAULT_CONSTRAINTS,
    };
    if (body.initial_html) payload.initial_html = body.initial_html;
    if (body.generate === false) payload.generate = false;
    return request('POST', '/sessions', { data: payload, timeout: TURN_TIMEOUT_MS });
}

async function getSession(sessionId) {
    return request('GET', `/sessions/${encodeURIComponent(sessionId)}`, { timeout: 30_000 });
}

async function deleteSession(sessionId) {
    return request('DELETE', `/sessions/${encodeURIComponent(sessionId)}`, { timeout: 30_000 });
}

async function uploadMedia(sessionId, files) {
    return request('POST', `/sessions/${encodeURIComponent(sessionId)}/media`, {
        data: { files },
        timeout: 120_000,
    });
}

async function listMedia(sessionId) {
    return request('GET', `/sessions/${encodeURIComponent(sessionId)}/media`, { timeout: 30_000 });
}

async function deleteMedia(sessionId, ref) {
    const encoded = encodeURIComponent(ref.startsWith('media:') ? ref : `media:${ref}`);
    return request('DELETE', `/sessions/${encodeURIComponent(sessionId)}/media/${encoded}`, {
        timeout: 30_000,
    });
}

async function postMessage(sessionId, body, { stream = false, res } = {}) {
    const payload = {
        content: body.content,
        current_html: body.current_html ?? null,
        attachments: body.attachments || undefined,
        files: body.files || undefined,
    };

    if (stream) {
        try {
            const response = await axios({
                method: 'POST',
                url: `${getBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/messages`,
                params: { stream: '1' },
                headers: {
                    ...authHeaders(),
                    Accept: 'text/event-stream',
                },
                data: payload,
                timeout: TURN_TIMEOUT_MS,
                responseType: 'stream',
            });
            return pipeSseStream(response.data, res);
        } catch (error) {
            throw mapAxiosError(error);
        }
    }

    return request('POST', `/sessions/${encodeURIComponent(sessionId)}/messages`, {
        data: payload,
        timeout: TURN_TIMEOUT_MS,
    });
}

async function generate(body, { stream = false, res } = {}) {
    const payload = {
        brief: body.brief,
        current_html: body.current_html ?? null,
        title: body.title || 'generate',
        constraints: body.constraints || DEFAULT_CONSTRAINTS,
    };

    if (stream) {
        try {
            const response = await axios({
                method: 'POST',
                url: `${getBaseUrl()}/generate`,
                params: { stream: '1' },
                headers: {
                    ...authHeaders(),
                    Accept: 'text/event-stream',
                },
                data: payload,
                timeout: TURN_TIMEOUT_MS,
                responseType: 'stream',
            });
            return pipeSseStream(response.data, res);
        } catch (error) {
            throw mapAxiosError(error);
        }
    }

    return request('POST', '/generate', { data: payload, timeout: TURN_TIMEOUT_MS });
}

module.exports = {
    DEFAULT_TEMPLATE_ID,
    DEFAULT_CONSTRAINTS,
    health,
    listTemplates,
    getTemplate,
    getTemplateHtml,
    createSession,
    getSession,
    deleteSession,
    uploadMedia,
    listMedia,
    deleteMedia,
    postMessage,
    generate,
    parseSseEvents,
    getBaseUrl,
};
