const axios = require('axios');
const settingsService = require('./settingsService');
const resolutSessionStore = require('./resolutSessionStore');

const EXPECTED_YAML_BASE_URL = 'https://demo.avinfors.ru/pfp/api/pfp/';
const DEFAULT_RESOLUT_TIMEOUT_MS = 10000;
const MIN_RESOLUT_TIMEOUT_MS = 8000;
const MAX_RESOLUT_TIMEOUT_MS = 120000;

/** Текст ошибки партнёра: у них часто сообщение в `name`, код в `code`. */
function pickResolutUpstreamMessage(errObj) {
    if (!errObj || typeof errObj !== 'object') return null;
    const name = errObj.name != null ? String(errObj.name).trim() : '';
    const msg = errObj.message != null ? String(errObj.message).trim() : '';
    const code = errObj.code != null ? String(errObj.code).trim() : '';
    if (name) return name;
    if (msg) return msg;
    if (code) return code;
    return null;
}

function mapUpstreamHttpStatusToApiStatus(status) {
    const st = Number(status);
    if (!Number.isFinite(st)) return 502;
    if (st === 401) return 401;
    if (st >= 400 && st < 500) return st;
    return 502;
}

function resolveResolutTimeoutMs() {
    const raw = Number(process.env.RESOLUT_TIMEOUT_MS);
    if (!Number.isFinite(raw) || raw <= 0) {
        return DEFAULT_RESOLUT_TIMEOUT_MS;
    }
    return Math.min(MAX_RESOLUT_TIMEOUT_MS, Math.max(MIN_RESOLUT_TIMEOUT_MS, Math.floor(raw)));
}

class ResolutService {
    constructor() {
        this.baseUrl = String(process.env.RESOLUT_BASE_URL || '').replace(/\/$/, '');
        this.operationPath = process.env.RESOLUT_OPERATION_PATH || '/';
        this.authType = process.env.RESOLUT_AUTH_TYPE || 'ПользовательРезолют';
        this.timeoutMs = resolveResolutTimeoutMs();
        this.enabled = process.env.RESOLUT_ENABLED !== 'false';
        this.allowedProjectId = Number(process.env.RESOLUT_PROJECT_ID || 0);
        this._yamlBaseUrlWarned = false;
    }

    assertProjectAllowed(projectId) {
        const pid = Number(projectId);
        if (!pid) {
            throw { status: 400, message: 'projectId is required for Resolut integration' };
        }
        if (!this.enabled) {
            throw { status: 403, message: 'Resolut integration is disabled' };
        }
        if (!this.allowedProjectId) {
            throw { status: 500, message: 'RESOLUT_PROJECT_ID is not configured' };
        }
        if (pid !== this.allowedProjectId) {
            throw { status: 403, message: `Resolut integration is allowed only for project ${this.allowedProjectId}` };
        }
    }

    /**
     * Только static key для фоновых вызовов без живой сессии агента (см. resolutSessionStore).
     * Логин/пароль Resolut не хранятся в env — Bearer получается при POST /auth/login через exchangePasswordForSessionKey.
     */
    async getCredentials(projectId) {
        const key = await settingsService.getValue('resolut_static_key', projectId) || process.env.RESOLUT_STATIC_KEY || null;

        if (!this.baseUrl) {
            throw { status: 500, message: 'RESOLUT_BASE_URL is not configured' };
        }

        return { key };
    }

    getNormalizedResponse(status, operation, payload = {}) {
        if (!payload || typeof payload !== 'object') {
            return { ok: true, status, operation, data: payload ?? null, err: null };
        }
        let err = payload.err || null;
        if (!err && payload.success === false) {
            const e = payload.error || {};
            err = {
                code: e.code || 'upstreamError',
                message: e.name || e.message || e.code || 'Resolut operation failed'
            };
        }
        const data = payload.data !== undefined ? payload.data : (err ? null : payload);
        return {
            ok: !err,
            status,
            operation,
            data: data ?? null,
            err
        };
    }

    sanitizeUpstreamData(data) {
        if (!data || typeof data !== 'object') return data;
        const clone = JSON.parse(JSON.stringify(data));
        if (clone.data && typeof clone.data === 'object') {
            delete clone.data.password;
            delete clone.data.login;
            delete clone.data.key;
        }
        if (clone.key) {
            clone.key = '[masked]';
        }
        return clone;
    }

    buildUrl(pathPart) {
        return `${this.baseUrl}${pathPart.startsWith('/') ? '' : '/'}${pathPart}`;
    }

    warnIfYamlBaseUrlMismatch() {
        if (this._yamlBaseUrlWarned) return;
        this._yamlBaseUrlWarned = true;
        const expectedNormalized = EXPECTED_YAML_BASE_URL.replace(/\/$/, '');
        if (this.baseUrl !== expectedNormalized) {
            console.warn(`[ResolutService] RESOLUT_BASE_URL differs from partner YAML server. Expected "${EXPECTED_YAML_BASE_URL}", got "${this.baseUrl}"`);
        }
    }

    /**
     * Authorize с логином/паролем агента (например пароль из POST /login). Не требует static key.
     */
    async exchangePasswordForSessionKey(projectId, login, password) {
        this.assertProjectAllowed(projectId);
        this.warnIfYamlBaseUrlMismatch();
        if (!this.baseUrl) {
            throw { status: 500, message: 'RESOLUT_BASE_URL is not configured' };
        }
        if (!login || !password) {
            throw { status: 400, message: 'Resolut authorize requires login and password' };
        }
        const url = this.buildUrl(this.operationPath);
        const payload = {
            operation: 'authorize',
            data: { login, password, type: this.authType }
        };
        let response;
        try {
            response = await axios.post(url, payload, {
                timeout: this.timeoutMs,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            if (error.response) {
                const upstreamData = this.sanitizeUpstreamData(error.response.data);
                const errObj = upstreamData && upstreamData.error ? upstreamData.error : (upstreamData && upstreamData.err ? upstreamData.err : null);
                throw {
                    status: error.response.status === 401 || error.response.status === 400 ? 401 : 502,
                    message: errObj ? (errObj.name || errObj.message || 'Resolut authorize failed') : 'Resolut authorize failed',
                    details: upstreamData
                };
            }
            const isTimeout =
                error.code === 'ECONNABORTED'
                || (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));
            if (isTimeout) {
                console.warn(`[ResolutService] authorize timeout after ${this.timeoutMs}ms (url ${url})`);
                throw {
                    status: 503,
                    error: 'ResolutTimeout',
                    message: 'Сервис страховых котировок не ответил вовремя. Повторите вход через минуту.'
                };
            }
            console.warn('[ResolutService] authorize transport error:', error.code || error.message || error);
            throw {
                status: 503,
                error: 'ResolutUnavailable',
                message: 'Не удалось связаться с сервисом страховых котировок. Повторите попытку позже.'
            };
        }

        const raw = response.data;
        if (raw && raw.success === false) {
            const msg = (raw.error && (raw.error.name || raw.error.message)) || 'Resolut authorize failed';
            throw { status: 401, message: msg };
        }
        const norm = this.getNormalizedResponse(response.status, 'authorize', raw);
        if (norm.err) {
            throw { status: 502, message: norm.err.message || 'Resolut authorize failed', details: norm.err };
        }
        const key = norm.data && norm.data.key ? norm.data.key : null;
        if (!key) {
            throw { status: 502, message: 'Resolut authorize response missing key' };
        }
        return key;
    }

    async callOperation(projectId, operation, data = {}, options = {}) {
        this.assertProjectAllowed(projectId);
        this.warnIfYamlBaseUrlMismatch();
        const useBearer = options.useBearer === true;
        const url = this.buildUrl(this.operationPath);
        const body = { operation, data };
        const headers = { 'Content-Type': 'application/json' };

        if (useBearer) {
            let bearerKey = null;
            if (options.userId != null) {
                bearerKey = resolutSessionStore.get(options.userId);
            }
            if (!bearerKey) {
                const { key } = await this.getCredentials(projectId);
                bearerKey = key;
            }
            if (!bearerKey) {
                console.warn(
                    `[ResolutService] ResolutSessionRequired operation=${operation} projectId=${projectId} userId=${options.userId != null ? options.userId : 'none'}`
                );
                throw {
                    status: 401,
                    error: 'ResolutSessionRequired',
                    message: 'Resolut session required: agent must re-login (no cached bearer and no resolut_static_key for background flow).'
                };
            }
            headers.Authorization = `Bearer ${bearerKey}`;
        }

        try {
            const response = await axios.post(url, body, {
                timeout: this.timeoutMs,
                headers
            });
            const norm = this.getNormalizedResponse(response.status, operation, response.data);
            // HTTP 200, но в теле success: false / err — иначе publish считает успехом и пишет пустой портфель в БД.
            if (norm.err) {
                const upstreamData = this.sanitizeUpstreamData(response.data);
                const errObj = upstreamData && upstreamData.err
                    ? upstreamData.err
                    : (upstreamData && upstreamData.error ? upstreamData.error : norm.err);
                const human = pickResolutUpstreamMessage(errObj) || norm.err.message || `Resolut ${operation} failed`;
                throw {
                    status: mapUpstreamHttpStatusToApiStatus(response.status),
                    error: 'ResolutUpstreamError',
                    message: human,
                    details: {
                        operation,
                        upstream_status: response.status,
                        upstream_err_code: errObj && errObj.code != null ? errObj.code : (norm.err.code || null),
                        upstream_err_message: pickResolutUpstreamMessage(errObj) || norm.err.message || null,
                        upstream_data: upstreamData
                    }
                };
            }
            return norm;
        } catch (error) {
            if (error.details) {
                throw error;
            }
            if (error.response) {
                const upstreamData = this.sanitizeUpstreamData(error.response.data);
                const errObj = upstreamData && upstreamData.err
                    ? upstreamData.err
                    : (upstreamData && upstreamData.error ? upstreamData.error : null);
                const human = pickResolutUpstreamMessage(errObj);
                throw {
                    status: mapUpstreamHttpStatusToApiStatus(error.response.status),
                    error: 'ResolutUpstreamError',
                    message: human || `Resolut ${operation} failed`,
                    details: {
                        operation,
                        upstream_status: error.response.status,
                        upstream_err_code: errObj ? errObj.code : null,
                        upstream_err_message: pickResolutUpstreamMessage(errObj),
                        upstream_data: upstreamData
                    }
                };
            }
            if (error.code === 'ECONNABORTED') {
                throw {
                    status: 504,
                    error: 'ResolutTimeout',
                    message: `Resolut ${operation} timeout`
                };
            }
            throw {
                status: 502,
                error: 'ResolutTransportError',
                message: `Resolut ${operation} transport error: ${error.message}`
            };
        }
    }

    /**
     * GET к upstream (operation + query): client (fetch по code), link.
     */
    async callOperationGet(projectId, operation, queryParams = {}, options = {}) {
        this.assertProjectAllowed(projectId);
        this.warnIfYamlBaseUrlMismatch();
        const useBearer = options.useBearer === true;
        const url = this.buildUrl(this.operationPath);
        const headers = {};
        const params = { operation, ...queryParams };

        if (useBearer) {
            let bearerKey = null;
            if (options.userId != null) {
                bearerKey = resolutSessionStore.get(options.userId);
            }
            if (!bearerKey) {
                const { key } = await this.getCredentials(projectId);
                bearerKey = key;
            }
            if (!bearerKey) {
                console.warn(
                    `[ResolutService] ResolutSessionRequired operation=${operation} (GET) projectId=${projectId} userId=${options.userId != null ? options.userId : 'none'}`
                );
                throw {
                    status: 401,
                    error: 'ResolutSessionRequired',
                    message: 'Resolut session required: agent must re-login (no cached bearer and no resolut_static_key for background flow).'
                };
            }
            headers.Authorization = `Bearer ${bearerKey}`;
        }

        try {
            const response = await axios.get(url, {
                timeout: this.timeoutMs,
                headers,
                params,
                validateStatus: () => true
            });
            const norm = this.getNormalizedResponse(response.status, operation, response.data);
            if (norm.err || response.status >= 400 || !norm.ok) {
                const upstreamData = this.sanitizeUpstreamData(response.data);
                const errObj = upstreamData && upstreamData.err
                    ? upstreamData.err
                    : (upstreamData && upstreamData.error ? upstreamData.error : norm.err);
                throw {
                    status: response.status >= 400 ? (response.status === 401 ? 401 : 502) : 502,
                    error: 'ResolutUpstreamError',
                    message: norm.err ? norm.err.message : `Resolut ${operation} failed`,
                    details: {
                        operation,
                        upstream_status: response.status,
                        upstream_err_code: errObj ? errObj.code : (norm.err ? norm.err.code : null),
                        upstream_err_message: errObj ? (errObj.name || errObj.message) : (norm.err ? norm.err.message : null),
                        upstream_data: upstreamData
                    }
                };
            }
            return norm;
        } catch (error) {
            if (error.details) {
                throw error;
            }
            if (error.response) {
                const upstreamData = this.sanitizeUpstreamData(error.response.data);
                const errObj = upstreamData && upstreamData.err
                    ? upstreamData.err
                    : (upstreamData && upstreamData.error ? upstreamData.error : null);
                throw {
                    status: error.response.status === 401 ? 401 : 502,
                    error: 'ResolutUpstreamError',
                    message: `Resolut ${operation} failed`,
                    details: {
                        operation,
                        upstream_status: error.response.status,
                        upstream_err_code: errObj ? errObj.code : null,
                        upstream_err_message: errObj ? (errObj.name || errObj.message) : null,
                        upstream_data: upstreamData
                    }
                };
            }
            if (error.code === 'ECONNABORTED') {
                throw {
                    status: 504,
                    error: 'ResolutTimeout',
                    message: `Resolut ${operation} timeout`
                };
            }
            throw {
                status: 502,
                error: 'ResolutTransportError',
                message: `Resolut ${operation} transport error: ${error.message}`
            };
        }
    }

    async products(projectId, data = {}, options = {}) {
        return this.callOperation(projectId, 'products', data, { useBearer: true, userId: options.userId });
    }

    async quote(projectId, data, options = {}) {
        return this.callOperation(projectId, 'quote', data, { useBearer: true, userId: options.userId });
    }

    /** Публикация портфеля котировок в Resolut (оформление). */
    async portfolio(projectId, data, options = {}) {
        return this.callOperation(projectId, 'portfolio', data, { useBearer: true, userId: options.userId });
    }

    /** Создание / изменение клиента в Resolut (POST). */
    async client(projectId, data, options = {}) {
        return this.callOperation(projectId, 'client', data, { useBearer: true, userId: options.userId });
    }

    /** Получение клиента по code (GET operation=client&code=). */
    async clientFetch(projectId, code, options = {}) {
        return this.callOperationGet(projectId, 'client', { code: String(code) }, { useBearer: true, userId: options.userId });
    }

    /** Одноразовая ссылка перехода в Resolut (GET operation=link), TTL ~20 с у партнёра. */
    async link(projectId, options = {}) {
        return this.callOperationGet(projectId, 'link', {}, { useBearer: true, userId: options.userId });
    }
}

module.exports = new ResolutService();
