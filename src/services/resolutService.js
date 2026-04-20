const axios = require('axios');
const settingsService = require('./settingsService');

const EXPECTED_YAML_BASE_URL = 'https://demo.avinfors.ru/pfp/api/pfp/';

class ResolutService {
    constructor() {
        this.baseUrl = String(process.env.RESOLUT_BASE_URL || '').replace(/\/$/, '');
        this.authPath = process.env.RESOLUT_AUTH_PATH || '/authorize';
        this.operationPath = process.env.RESOLUT_OPERATION_PATH || '/';
        this.authType = process.env.RESOLUT_AUTH_TYPE || 'ПользовательРезолют';
        this.timeoutMs = Number(process.env.RESOLUT_TIMEOUT_MS || 10000);
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

    async getCredentials(projectId) {
        const login = await settingsService.getValue('resolut_agent_login', projectId) || process.env.RESOLUT_AGENT_LOGIN || null;
        const password = await settingsService.getValue('resolut_agent_password', projectId) || process.env.RESOLUT_AGENT_PASSWORD || null;
        const key = await settingsService.getValue('resolut_static_key', projectId) || process.env.RESOLUT_STATIC_KEY || null;

        if (!this.baseUrl) {
            throw { status: 500, message: 'RESOLUT_BASE_URL is not configured' };
        }
        if (!login || !password || !key) {
            throw {
                status: 400,
                message: 'Resolut credentials are incomplete. Set resolut_agent_login/resolut_agent_password/resolut_static_key in project settings or env.'
            };
        }

        return { login, password, key };
    }

    getNormalizedResponse(status, operation, payload = {}) {
        const data = payload && payload.data !== undefined ? payload.data : payload;
        const err = payload && payload.err ? payload.err : null;
        return {
            ok: !err,
            status,
            operation,
            data: data || null,
            err: err || null
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

    async callOperation(projectId, operation, data = {}, options = {}) {
        this.assertProjectAllowed(projectId);
        this.warnIfYamlBaseUrlMismatch();
        const credentials = await this.getCredentials(projectId);
        const useBearer = options.useBearer === true;
        const url = this.buildUrl(this.operationPath);
        const body = { operation, data };
        const headers = { 'Content-Type': 'application/json' };

        if (useBearer) {
            headers.Authorization = `Bearer ${credentials.key}`;
        }

        try {
            const response = await axios.post(url, body, {
                timeout: this.timeoutMs,
                headers
            });
            return this.getNormalizedResponse(response.status, operation, response.data);
        } catch (error) {
            if (error.response) {
                const upstreamData = this.sanitizeUpstreamData(error.response.data);
                const errObj = upstreamData && upstreamData.err ? upstreamData.err : null;
                throw {
                    status: 502,
                    error: 'ResolutUpstreamError',
                    message: `Resolut ${operation} failed`,
                    details: {
                        operation,
                        upstream_status: error.response.status,
                        upstream_err_code: errObj ? errObj.code : null,
                        upstream_err_message: errObj ? errObj.message : null,
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

    async authorizeLegacy(projectId) {
        this.assertProjectAllowed(projectId);
        this.warnIfYamlBaseUrlMismatch();
        const credentials = await this.getCredentials(projectId);
        const url = this.buildUrl(this.authPath);
        const payload = {
            login: credentials.login,
            password: credentials.password,
            key: credentials.key
        };
        const response = await axios.post(url, payload, {
            timeout: this.timeoutMs,
            headers: { 'Content-Type': 'application/json' }
        });
        return this.getNormalizedResponse(response.status, 'authorize', response.data);
    }

    async authorize(projectId) {
        try {
            const credentials = await this.getCredentials(projectId);
            return await this.callOperation(
                projectId,
                'authorize',
                {
                    login: credentials.login,
                    password: credentials.password,
                    type: this.authType
                },
                { useBearer: false }
            );
        } catch (error) {
            // Hybrid: keep legacy auth path as fallback for partner environments
            if (error.details && error.details.upstream_err_code === 'operationNotFound') {
                try {
                    return await this.authorizeLegacy(projectId);
                } catch (legacyError) {
                    throw legacyError;
                }
            }
            throw error;
        }
    }

    async products(projectId, data = {}) {
        return this.callOperation(projectId, 'products', data, { useBearer: true });
    }

    async quote(projectId, data) {
        return this.callOperation(projectId, 'quote', data, { useBearer: true });
    }
}

module.exports = new ResolutService();
