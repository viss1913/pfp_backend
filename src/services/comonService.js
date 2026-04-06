const axios = require('axios');
const { comonGetWithRetry } = require('../utils/comonHttp');
const { normalizeStrategyDetailsFromNextData } = require('../utils/comonStrategyNextData');

const DEFAULT_BASE = 'https://www.comon.ru';
const DEFAULT_UA =
    process.env.COMON_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function baseUrl() {
    const raw = (process.env.COMON_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
    return raw;
}

/** Публичный URL JSON графика доходности: /api/v2/strategies/{id}/profit */
function strategyProfitApiUrl(comonStrategyId) {
    const id = String(comonStrategyId == null ? '' : comonStrategyId).trim();
    if (!/^\d+$/.test(id)) return null;
    return `${baseUrl()}/api/v2/strategies/${id}/profit`;
}

function allowedComonHostnames() {
    const set = new Set(['www.comon.ru', 'comon.ru']);
    try {
        set.add(new URL(baseUrl()).hostname.toLowerCase());
    } catch (_) {
        /* ignore */
    }
    return set;
}

/**
 * Из ссылки https://www.comon.ru/strategies/109003/ (или пути /strategies/109003/) достаёт id.
 * Можно передать просто "109003".
 */
function parseStrategyUrlToId(raw) {
    const trimmed = String(raw).trim();
    if (!trimmed) {
        throw new Error('Empty strategy URL');
    }
    if (/^\d+$/.test(trimmed)) {
        return trimmed;
    }

    const idFromPath = (pathname) => {
        const m = String(pathname).match(/\/strategies\/(\d+)(?:\/|$|\?|#)/i);
        return m ? m[1] : null;
    };

    if (!/^https?:\/\//i.test(trimmed)) {
        const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        const id = idFromPath(path);
        if (id) return id;
        throw new Error('Invalid strategy URL (expected …/strategies/<id>/…)');
    }

    let u;
    try {
        u = new URL(trimmed);
    } catch {
        throw new Error('Invalid strategy URL');
    }

    const host = u.hostname.toLowerCase();
    if (!allowedComonHostnames().has(host)) {
        throw new Error('Link must point to comon.ru');
    }

    const id = idFromPath(u.pathname);
    if (!id) {
        throw new Error('No strategy id in URL (expected …/strategies/<id>/…)');
    }
    return id;
}

/** Удобный объект для фронта после разбора ссылки. */
function resolveStrategyLink(raw) {
    const strategyId = parseStrategyUrlToId(raw);
    const b = baseUrl();
    return {
        strategyId,
        pageUrl: `${b}/strategies/${strategyId}/`,
        profitApiPath: `/api/pfp/comon/strategies/${strategyId}/profit`,
    };
}

function extraHeaders() {
    const json = process.env.COMON_EXTRA_HEADERS_JSON;
    if (!json || !json.trim()) return {};
    try {
        return JSON.parse(json);
    } catch {
        return {};
    }
}

function cookieHeader() {
    const c = process.env.COMON_COOKIE;
    return c && String(c).trim() ? { Cookie: String(c).trim() } : {};
}

function client() {
    return axios.create({
        baseURL: baseUrl(),
        timeout: Number(process.env.COMON_HTTP_TIMEOUT_MS) || 20000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
            'User-Agent': DEFAULT_UA,
            Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
            ...extraHeaders(),
            ...cookieHeader(),
        },
    });
}

/** Заголовки как у вкладки на странице стратегии — часть WAF пропускает только такие запросы. */
function strategyPageLikeHeaders(comonNumericId) {
    const b = baseUrl();
    return {
        Referer: `${b}/strategies/${comonNumericId}/`,
        Origin: b,
    };
}

/** Каталог стратегий (список) — Referer на раздел стратегий без id. */
function strategiesCatalogHeaders() {
    const b = baseUrl();
    return {
        Referer: `${b}/strategies`,
        Origin: b,
    };
}

/**
 * Мягкая нормализация тела списка стратегий: всегда массив data.
 * @param {unknown} body
 * @returns {{ data: object[], paging: object }}
 */
function normalizeStrategiesListPayload(body) {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        let data = body.data;
        if (!Array.isArray(data)) {
            console.warn('[comonService] strategies list: "data" is not an array, using []');
            data = [];
        }
        const paging = body.paging && typeof body.paging === 'object' ? body.paging : {};
        return { ...body, data, paging };
    }
    console.warn('[comonService] strategies list: unexpected body shape, using empty data');
    return { data: [], paging: {} };
}

/**
 * Публичный список стратегий (пагинация).
 * Путь по умолчанию — типичный для Next/API Comon; переопределение: COMON_STRATEGIES_LIST_PATH (относительно base URL).
 * @param {{ page?: number, pageSize?: number }} query
 * @returns {Promise<{ paging?: object, data?: object[] }>}
 */
async function fetchStrategiesList(query = {}) {
    const listPath =
        (process.env.COMON_STRATEGIES_LIST_PATH && String(process.env.COMON_STRATEGIES_LIST_PATH).trim()) ||
        '/api/v2/strategies';
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 100;

    const http = client();
    const res = await comonGetWithRetry(http, listPath, {
        params: { page, pageSize },
        headers: {
            Accept: 'application/json',
            ...strategiesCatalogHeaders(),
        },
    });

    if (res.status < 200 || res.status >= 300) {
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        if (res.status === 403) {
            const err = new Error(
                'Comon вернул 403 при запросе списка стратегий: IP сервера могут резать. ' +
                    'Задайте COMON_COOKIE или согласуйте доступ. Тело: ' +
                    String(body).slice(0, 280)
            );
            err.comonHttpStatus = 403;
            throw err;
        }
        const err = new Error(`Comon strategies list HTTP ${res.status}: ${String(body).slice(0, 400)}`);
        err.comonHttpStatus = res.status;
        throw err;
    }

    return normalizeStrategiesListPayload(res.data);
}

/**
 * Публичный endpoint Comon (как в UI): статус обслуживания и т.п.
 */
async function getMaintenanceInfo() {
    const http = client();
    const res = await comonGetWithRetry(http, '/api/v1/maintenance-info', {
        headers: { Accept: 'application/json' },
    });
    if (res.status < 200 || res.status >= 300) {
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const err = new Error(`Comon maintenance-info HTTP ${res.status}: ${String(body).slice(0, 400)}`);
        err.comonHttpStatus = res.status;
        throw err;
    }
    return res.data;
}

/**
 * Достаёт встроенный JSON Next.js из HTML (если страница отдаёт SSR).
 */
function extractNextData(html) {
    if (!html || typeof html !== 'string') return null;
    const m = html.match(
        /<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([^<]*)<\/script>/i
    );
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

function assertNumericStrategyId(strategyId) {
    const id = String(strategyId).trim();
    if (!/^\d+$/.test(id)) {
        throw new Error('Invalid strategy id');
    }
    return id;
}

/**
 * Динамика стратегии (кривая доходности / показатели по дням).
 * GET https://www.comon.ru/api/v2/strategies/{id}/profit
 */
async function getStrategyProfit(strategyId) {
    const id = assertNumericStrategyId(strategyId);
    const http = client();
    const path = `/api/v2/strategies/${id}/profit`;
    const res = await comonGetWithRetry(http, path, {
        headers: {
            Accept: 'application/json',
            ...strategyPageLikeHeaders(id),
        },
    });
    if (res.status < 200 || res.status >= 300) {
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        if (res.status === 403) {
            const err = new Error(
                'Comon вернул 403: запрос с IP сервера часто режут (датацентры вроде Railway). ' +
                    'Варианты: строить график на фронте по полю comon_profit_api_url; задать COMON_COOKIE из залогиненной сессии на comon.ru; ' +
                    'согласовать доступ / allowlist IP с Comon. Техническое тело: ' +
                    String(body).slice(0, 280)
            );
            err.comonHttpStatus = 403;
            throw err;
        }
        const err = new Error(`Comon strategy profit HTTP ${res.status}: ${String(body).slice(0, 400)}`);
        err.comonHttpStatus = res.status;
        throw err;
    }
    return res.data;
}

/**
 * HTML страницы стратегии + распарсенный __NEXT_DATA__ при наличии.
 */
async function getStrategyPagePayload(strategyId) {
    const id = assertNumericStrategyId(strategyId);
    const http = client();
    const path = `/strategies/${id}/`;
    const res = await comonGetWithRetry(http, path, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            ...strategyPageLikeHeaders(id),
        },
    });
    if (res.status < 200 || res.status >= 300) {
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const err = new Error(`Comon strategy page HTTP ${res.status}: ${String(body).slice(0, 400)}`);
        err.comonHttpStatus = res.status;
        throw err;
    }
    const html = typeof res.data === 'string' ? res.data : '';
    const nextData = extractNextData(html);
    return {
        strategyId: id,
        pageUrl: `${baseUrl()}${path}`,
        hasNextData: Boolean(nextData),
        nextData,
        htmlLength: html.length,
    };
}

/**
 * Карточка стратегии в урезанном виде из __NEXT_DATA__ (без сырого HTML).
 * @param {string|number} strategyId
 */
async function getNormalizedStrategyDetails(strategyId) {
    const id = assertNumericStrategyId(strategyId);
    const page = await getStrategyPagePayload(id);
    const normalized = normalizeStrategyDetailsFromNextData(id, page.nextData);
    return {
        ...normalized,
        pageUrl: page.pageUrl,
        hasNextData: page.hasNextData,
    };
}

module.exports = {
    getMaintenanceInfo,
    getStrategyProfit,
    getStrategyPagePayload,
    getNormalizedStrategyDetails,
    fetchStrategiesList,
    extractNextData,
    normalizeStrategiesListPayload,
    parseStrategyUrlToId,
    resolveStrategyLink,
    strategyProfitApiUrl,
    baseUrl,
    strategiesCatalogHeaders,
};
