const axios = require('axios');

function readRetryConfig() {
    const r = parseInt(process.env.COMON_HTTP_RETRIES, 10);
    const retries = Number.isFinite(r) && r >= 0 ? Math.min(r, 5) : 2;
    const b = parseInt(process.env.COMON_HTTP_RETRY_BASE_MS, 10);
    const baseMs = Number.isFinite(b) && b >= 50 ? Math.min(b, 30000) : 500;
    return { retries, baseMs };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status) {
    return status === 502 || status === 503 || status === 504 || status === 429;
}

/**
 * @param {unknown} err
 */
function isTransientAxiosError(err) {
    if (!err || !axios.isAxiosError(err)) return false;
    if (err.code === 'ECONNABORTED') return true;
    if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(err.code)) {
        return true;
    }
    if (!err.response) return true;
    return isTransientHttpStatus(err.response.status);
}

function truncateDetail(detail, max = 400) {
    return String(detail == null ? '' : detail)
        .replace(/\s+/g, ' ')
        .slice(0, max);
}

/**
 * @param {{ method: string, path: string, status?: number|string, detail?: string, attempt: number, willRetry: boolean }} p
 */
function logComonUpstreamError(p) {
    const suffix = p.willRetry ? 'will_retry=1' : 'will_retry=0';
    console.warn(
        `[comon_upstream] ${p.method} ${p.path} http_status=${p.status ?? 'n/a'} attempt=${p.attempt} ${suffix} ${truncateDetail(p.detail)}`
    );
}

/**
 * GET с ретраями на сеть / таймаут / 502–504 / 429. Без ретраев на 401/403/404 и прочий финальный статус.
 * @param {import('axios').AxiosInstance} http
 * @param {string} path
 * @param {import('axios').AxiosRequestConfig} [config]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function comonGetWithRetry(http, path, config = {}) {
    const { retries, baseMs } = readRetryConfig();
    let lastErr;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const res = await http.get(path, config);
            if (res.status >= 200 && res.status < 300) {
                return res;
            }
            const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            const snippet = String(body).slice(0, 280);
            const transient = isTransientHttpStatus(res.status);
            const willRetry = transient && attempt < retries;
            logComonUpstreamError({
                method: 'GET',
                path,
                status: res.status,
                detail: snippet,
                attempt: attempt + 1,
                willRetry,
            });
            if (willRetry) {
                await sleep(baseMs * 2 ** attempt);
                continue;
            }
            return res;
        } catch (err) {
            lastErr = err;
            const transient = isTransientAxiosError(err);
            const status = err.response != null ? err.response.status : 'n/a';
            const detail = err.message || String(err);
            const willRetry = transient && attempt < retries;
            logComonUpstreamError({
                method: 'GET',
                path,
                status,
                detail,
                attempt: attempt + 1,
                willRetry,
            });
            if (willRetry) {
                await sleep(baseMs * 2 ** attempt);
                continue;
            }
            throw err;
        }
    }

    throw lastErr || new Error('Comon request failed after retries');
}

module.exports = {
    comonGetWithRetry,
    readRetryConfig,
    logComonUpstreamError,
    isTransientHttpStatus,
    isTransientAxiosError,
};
