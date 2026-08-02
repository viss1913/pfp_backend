const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const { sanitizeLlmUserText } = require('../utils/sanitizeLlmUserText');
const { openrouterAxiosExtras, openrouterStreamAxiosExtras } = require('../utils/openrouterProxy');
require('dotenv').config();

function stripSurroundingQuotes(value) {
    let key = String(value || '').trim();
    if (
        (key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))
    ) {
        key = key.slice(1, -1).trim();
    }
    return key;
}

function isRetriableLlmError(err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || err).toLowerCase();
    return (
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_STREAM_DESTROYED'].includes(
            code
        ) ||
        msg.includes('aborted') ||
        msg.includes('socket hang up') ||
        msg.includes('network')
    );
}

/** @deprecated use isRetriableLlmError */
const isRetriableOpenRouterError = isRetriableLlmError;

/** In-memory GigaChat OAuth token (process-local, ~30 min TTL from Sber). */
const gigachatTokenCache = {
    accessToken: null,
    /** unix ms when token should be refreshed */
    refreshAtMs: 0,
    /** in-flight refresh promise (dedupe concurrent callers) */
    inflight: null,
};

function resolveGigaChatCredentials() {
    const direct = stripSurroundingQuotes(process.env.GIGACHAT_CREDENTIALS || process.env.GIGACHAT_AUTHORIZATION_KEY || '');
    if (direct) return direct;
    const clientId = stripSurroundingQuotes(process.env.GIGACHAT_CLIENT_ID || '');
    const clientSecret = stripSurroundingQuotes(process.env.GIGACHAT_CLIENT_SECRET || '');
    if (clientId && clientSecret) {
        return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
    }
    return '';
}

function resolveGigaChatScope() {
    const raw = String(process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS')
        .trim()
        .toUpperCase();
    if (raw === 'PERS' || raw === 'PERSONAL') return 'GIGACHAT_API_PERS';
    if (raw === 'B2B') return 'GIGACHAT_API_B2B';
    if (raw === 'CORP' || raw === 'CORPORATE') return 'GIGACHAT_API_CORP';
    return raw || 'GIGACHAT_API_PERS';
}

function resolveGigaChatOauthUrl() {
    return (
        process.env.GIGACHAT_OAUTH_URL ||
        'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
    ).replace(/\/+$/, '');
}

function resolveGigaChatBaseUrl() {
    return (process.env.GIGACHAT_BASE_URL || 'https://api.giga.chat/v1').replace(/\/+$/, '');
}

function resolveGigaChatDefaultModel() {
    return String(process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro').trim() || 'GigaChat-2-Pro';
}

/** Optional insecure TLS for local smoke when Sber CA is missing (do not enable in prod). */
function gigachatHttpsAgent() {
    const insecure =
        String(process.env.GIGACHAT_INSECURE_TLS || '')
            .trim()
            .toLowerCase() === '1' ||
        String(process.env.GIGACHAT_INSECURE_TLS || '')
            .trim()
            .toLowerCase() === 'true';
    if (!insecure) return undefined;
    return new https.Agent({ rejectUnauthorized: false });
}

function looksLikeGigaChatModelId(model) {
    const m = String(model || '').trim();
    if (!m) return false;
    return /^gigachat/i.test(m);
}

/**
 * Fetch / reuse GigaChat access_token (Bearer). Token lives ~30 min.
 * @param {string} credentials Base64 Authorization key
 * @param {string} scope
 * @returns {Promise<string>}
 */
async function getGigaChatAccessToken(credentials, scope) {
    const now = Date.now();
    if (gigachatTokenCache.accessToken && now < gigachatTokenCache.refreshAtMs) {
        return gigachatTokenCache.accessToken;
    }
    if (gigachatTokenCache.inflight) {
        return gigachatTokenCache.inflight;
    }

    gigachatTokenCache.inflight = (async () => {
        const rquid = crypto.randomUUID();
        const httpsAgent = gigachatHttpsAgent();
        const response = await axios.post(
            resolveGigaChatOauthUrl(),
            new URLSearchParams({ scope: scope || resolveGigaChatScope() }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                    RqUID: rquid,
                    Authorization: `Basic ${credentials}`,
                },
                timeout: Number(process.env.GIGACHAT_OAUTH_TIMEOUT_MS || 30000),
                ...(httpsAgent ? { httpsAgent } : {}),
            }
        );
        const accessToken = response.data?.access_token;
        if (!accessToken) {
            throw new Error('GigaChat OAuth: no access_token in response');
        }
        // expires_at is unix seconds; refresh 60s early
        const expiresAtSec = Number(response.data?.expires_at || 0);
        const refreshAtMs =
            expiresAtSec > 0
                ? expiresAtSec * 1000 - 60_000
                : now + 25 * 60_000;
        gigachatTokenCache.accessToken = accessToken;
        gigachatTokenCache.refreshAtMs = Math.max(refreshAtMs, now + 60_000);
        return accessToken;
    })()
        .catch((err) => {
            gigachatTokenCache.accessToken = null;
            gigachatTokenCache.refreshAtMs = 0;
            throw err;
        })
        .finally(() => {
            gigachatTokenCache.inflight = null;
        });

    return gigachatTokenCache.inflight;
}

/**
 * LLM provider: openrouter (default) | yandex | siliconflow | gigachat
 * Yandex / GigaChat only when AI_PROVIDER is set explicitly.
 */
function resolveProvider() {
    const explicit = String(process.env.AI_PROVIDER || '')
        .trim()
        .toLowerCase();
    if (explicit === 'yandex' || explicit === 'yandexgpt') return 'yandex';
    if (explicit === 'gigachat' || explicit === 'sber' || explicit === 'giga') return 'gigachat';
    if (explicit === 'siliconflow') return 'siliconflow';
    if (explicit === 'openrouter') return 'openrouter';

    if (!process.env.OPENROUTER_API_KEY && process.env.SILICONFLOW_API_KEY) {
        return 'siliconflow';
    }
    return 'openrouter';
}

function resolveYandexModelUri() {
    const explicit = String(process.env.YANDEX_CLOUD_MODEL || '').trim();
    if (explicit) return explicit;
    const folderId = String(process.env.YANDEX_CLOUD_FOLDER_ID || '').trim();
    if (folderId) return `gpt://${folderId}/yandexgpt/latest`;
    return 'yandexgpt/latest';
}

/**
 * OpenRouter / SiliconFlow model ids (google/..., openai/...) are invalid for Yandex/GigaChat.
 * Force provider-native model when needed.
 */
function looksLikeForeignModelId(model) {
    const m = String(model || '').trim();
    if (!m) return false;
    if (m.startsWith('gpt://') || m.startsWith('cls://') || m.startsWith('emb://')) return false;
    if (/^yandexgpt/i.test(m)) return false;
    if (looksLikeGigaChatModelId(m)) return false;
    // openrouter-style: vendor/model or with :suffix
    if (m.includes('/')) return true;
    return false;
}

function resolveDefaultModel(provider) {
    if (provider === 'yandex') {
        return resolveYandexModelUri();
    }
    if (provider === 'gigachat') {
        return resolveGigaChatDefaultModel();
    }
    if (process.env.OPENROUTER_MODEL) return process.env.OPENROUTER_MODEL;
    return provider === 'siliconflow' ? 'deepseek-ai/DeepSeek-V3' : 'google/gemma-3-27b-it';
}

function resolveEffectiveModel(provider, model) {
    const requested = model != null ? String(model).trim() : '';
    if (provider === 'yandex') {
        if (!requested || looksLikeForeignModelId(requested)) {
            return resolveYandexModelUri();
        }
        return requested;
    }
    if (provider === 'gigachat') {
        if (!requested || looksLikeForeignModelId(requested)) {
            return resolveGigaChatDefaultModel();
        }
        return requested;
    }
    return requested || resolveDefaultModel(provider);
}

/**
 * Явная OpenRouter/SiliconFlow model id (google/...) → OpenRouter даже при AI_PROVIDER=yandex/gigachat.
 * Явная GigaChat model id → gigachat даже при другом global provider (если credentials есть).
 */
function resolveProviderForCall(globalProvider, model) {
    const requested = model != null ? String(model).trim() : '';
    if (requested && looksLikeGigaChatModelId(requested) && resolveGigaChatCredentials()) {
        return 'gigachat';
    }
    if (requested && looksLikeForeignModelId(requested)) {
        if (stripSurroundingQuotes(process.env.OPENROUTER_API_KEY || '')) return 'openrouter';
        if (stripSurroundingQuotes(process.env.SILICONFLOW_API_KEY || '')) return 'siliconflow';
    }
    return globalProvider;
}

function buildProviderRuntime(provider) {
    const isYandex = provider === 'yandex';
    const isGigaChat = provider === 'gigachat';
    const isSiliconFlow = provider === 'siliconflow';
    const isOpenRouter = provider === 'openrouter';

    let apiKey = '';
    let gigaCredentials = null;
    let gigaScope = null;
    if (isYandex) {
        apiKey = stripSurroundingQuotes(process.env.YANDEX_CLOUD_API_KEY || '');
    } else if (isGigaChat) {
        gigaCredentials = resolveGigaChatCredentials();
        gigaScope = resolveGigaChatScope();
        // Placeholder until OAuth; presence check uses credentials
        apiKey = gigaCredentials;
    } else if (isSiliconFlow) {
        apiKey = stripSurroundingQuotes(process.env.SILICONFLOW_API_KEY || '');
    } else {
        apiKey = stripSurroundingQuotes(process.env.OPENROUTER_API_KEY || process.env.SILICONFLOW_API_KEY || '');
    }

    const folderId = stripSurroundingQuotes(process.env.YANDEX_CLOUD_FOLDER_ID || '') || null;

    let baseUrl;
    if (isYandex) {
        baseUrl = (
            process.env.YANDEX_AI_BASE_URL ||
            process.env.YANDEX_CLOUD_BASE_URL ||
            'https://ai.api.cloud.yandex.net/v1'
        ).replace(/\/+$/, '');
    } else if (isGigaChat) {
        baseUrl = resolveGigaChatBaseUrl();
    } else if (isSiliconFlow) {
        baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
    } else {
        baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    }

    return {
        provider,
        isYandex,
        isGigaChat,
        isSiliconFlow,
        isOpenRouter,
        apiKey: apiKey || null,
        gigaCredentials,
        gigaScope,
        folderId,
        baseUrl,
        providerLabel: isYandex
            ? 'YandexGPT'
            : isGigaChat
              ? 'GigaChat'
              : isSiliconFlow
                ? 'SiliconFlow'
                : 'OpenRouter',
        missingKeyError: isYandex
            ? 'YANDEX_CLOUD_API_KEY is not set (AI_PROVIDER=yandex)'
            : isGigaChat
              ? 'GIGACHAT_CREDENTIALS (or CLIENT_ID+SECRET) is not set (AI_PROVIDER=gigachat)'
              : isSiliconFlow
                ? 'SILICONFLOW_API_KEY is not set'
                : 'OPENROUTER_API_KEY is not set',
    };
}

function streamPartialLooksComplete(fullText) {
    const t = String(fullText || '').trim();
    if (t.length < 80) return false;
    return /[.!?…)]\s*$/.test(t) || /🌟\s*$/.test(t);
}

class AiService {
    constructor() {
        this.provider = resolveProvider();
        this.isYandex = this.provider === 'yandex';
        this.isGigaChat = this.provider === 'gigachat';
        this.isSiliconFlow = this.provider === 'siliconflow';
        this.isOpenRouter = this.provider === 'openrouter';

        let key = '';
        if (this.isYandex) {
            key = process.env.YANDEX_CLOUD_API_KEY || '';
        } else if (this.isGigaChat) {
            key = resolveGigaChatCredentials();
        } else if (this.isSiliconFlow) {
            key = process.env.SILICONFLOW_API_KEY || '';
        } else {
            key = process.env.OPENROUTER_API_KEY || process.env.SILICONFLOW_API_KEY || '';
        }
        key = stripSurroundingQuotes(key);
        this.apiKey = key || null;
        this.gigaCredentials = this.isGigaChat ? key || null : null;
        this.gigaScope = this.isGigaChat ? resolveGigaChatScope() : null;

        this.folderId = stripSurroundingQuotes(process.env.YANDEX_CLOUD_FOLDER_ID || '') || null;

        if (this.isYandex) {
            this.baseUrl = (
                process.env.YANDEX_AI_BASE_URL ||
                process.env.YANDEX_CLOUD_BASE_URL ||
                'https://ai.api.cloud.yandex.net/v1'
            ).replace(/\/+$/, '');
        } else if (this.isGigaChat) {
            this.baseUrl = resolveGigaChatBaseUrl();
        } else if (this.isSiliconFlow) {
            this.baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
        } else {
            this.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
        }

        this.siteUrl = process.env.App_URL || 'https://pfp.app';
        this.appName = 'PFP Constructor Bot';
    }

    get providerLabel() {
        if (this.isYandex) return 'YandexGPT';
        if (this.isGigaChat) return 'GigaChat';
        if (this.isSiliconFlow) return 'SiliconFlow';
        return 'OpenRouter';
    }

    get missingKeyError() {
        if (this.isYandex) return 'YANDEX_CLOUD_API_KEY is not set (AI_PROVIDER=yandex)';
        if (this.isGigaChat) {
            return 'GIGACHAT_CREDENTIALS (or CLIENT_ID+SECRET) is not set (AI_PROVIDER=gigachat)';
        }
        if (this.isSiliconFlow) return 'SILICONFLOW_API_KEY is not set';
        return 'OPENROUTER_API_KEY is not set';
    }

    /** Headers for chat/completions (OpenAI-compatible). */
    _authHeaders(runtime = null) {
        const rt = runtime || this;
        if (rt.isYandex) {
            const headers = {
                Authorization: `Api-Key ${rt.apiKey}`,
                'Content-Type': 'application/json',
            };
            if (rt.folderId) {
                headers['x-folder-id'] = rt.folderId;
            }
            return headers;
        }
        if (rt.isGigaChat) {
            return {
                Authorization: `Bearer ${rt.apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };
        }
        return {
            Authorization: `Bearer ${rt.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.appName,
        };
    }

    /** Axios extras: OpenRouter proxy only for OpenRouter egress. */
    _axiosExtras(stream = false, runtime = null) {
        const rt = runtime || this;
        if (rt.isOpenRouter) {
            return stream ? openrouterStreamAxiosExtras() : openrouterAxiosExtras();
        }
        const timeout = stream
            ? Number(process.env.OPENROUTER_STREAM_TIMEOUT_MS || process.env.OPENROUTER_HTTP_TIMEOUT_MS || 120000)
            : Number(process.env.OPENROUTER_HTTP_TIMEOUT_MS || 60000);
        const extras = {
            timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : stream ? 120000 : 60000,
        };
        if (rt.isGigaChat) {
            const httpsAgent = gigachatHttpsAgent();
            if (httpsAgent) extras.httpsAgent = httpsAgent;
        }
        return extras;
    }

    _resolveCallRuntime(model) {
        const provider = resolveProviderForCall(this.provider, model);
        const runtime = buildProviderRuntime(provider);
        runtime.effectiveModel = resolveEffectiveModel(provider, model);
        return runtime;
    }

    /** For GigaChat: exchange Authorization key → short-lived Bearer access_token. */
    async _ensureRuntimeAuth(runtime) {
        if (!runtime?.isGigaChat) return runtime;
        const credentials = runtime.gigaCredentials || resolveGigaChatCredentials();
        if (!credentials) {
            throw new Error(runtime.missingKeyError);
        }
        const token = await getGigaChatAccessToken(credentials, runtime.gigaScope || resolveGigaChatScope());
        runtime.apiKey = token;
        return runtime;
    }

    injectContext(template, agent) {
        if (!template) return '';
        const fallbackName = [agent?.first_name, agent?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim();
        const resolvedName = agent?.name || fallbackName || agent?.email || 'Agent';
        return template.replace(/\{\{agent_name\}\}/g, resolvedName);
    }

    _writePfpStreamDone(res, options, fullText) {
        const extra = options.appendTextBeforeDone;
        if (extra && String(extra).length > 0) {
            res.write(`data: ${JSON.stringify({ type: 'text', text: String(extra) })}\n\n`);
        }
        if (options.trailingSsePayload != null) {
            res.write(`data: ${JSON.stringify(options.trailingSsePayload)}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        if (typeof res.flush === 'function') {
            res.flush();
        }
        res.end();
        const tail = extra && String(extra).length > 0 ? String(extra) : '';
        return sanitizeLlmUserText(fullText + tail);
    }

    async _streamCompletionOnce(messages, runtime, res, options = {}) {
        const sseFormat = options.sseFormat === 'pfp' ? 'pfp' : 'openai';

        const response = await axios.post(
            `${runtime.baseUrl}/chat/completions`,
            {
                model: runtime.effectiveModel,
                messages: messages,
                stream: true,
            },
            {
                headers: this._authHeaders(runtime),
                responseType: 'stream',
                ...this._axiosExtras(true, runtime),
            }
        );

        return await new Promise((resolve, reject) => {
            let fullText = '';
            let lineBuf = '';
            let settled = false;

            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                fn(value);
            };

            const parsePayload = (payload) => {
                if (!payload || payload === '[DONE]') return;
                try {
                    const json = JSON.parse(payload);
                    const piece = json.choices?.[0]?.delta?.content;
                    if (piece) {
                        fullText += piece;
                        if (sseFormat === 'pfp') {
                            res.write(`data: ${JSON.stringify({ type: 'text', text: piece })}\n\n`);
                        }
                    }
                } catch (_) {
                    /* неполный JSON между чанками — ждём следующую строку */
                }
            };

            const processLine = (line) => {
                const trimmed = line.replace(/\r$/, '').trimEnd();
                if (!trimmed.startsWith('data:')) return;
                const raw = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed.slice(5).trim();
                parsePayload(raw);
            };

            const feedChunk = (chunkBuf) => {
                const s = chunkBuf.toString();
                if (sseFormat === 'openai') {
                    res.write(chunkBuf);
                }
                lineBuf += s;
                let nl;
                while ((nl = lineBuf.indexOf('\n')) >= 0) {
                    const line = lineBuf.slice(0, nl);
                    lineBuf = lineBuf.slice(nl + 1);
                    processLine(line);
                }
            };

            const failStream = (err) => {
                try {
                    response.data.destroy?.();
                } catch (_) {
                    /* ignore */
                }
                err.__streamBytesSent = fullText.length;
                if (fullText.length > 0) {
                    err.__partialText = fullText;
                    err.__streamIncomplete = !streamPartialLooksComplete(fullText);
                }
                finish(reject, err);
            };

            response.data.on('data', (chunk) => {
                feedChunk(chunk);
            });

            response.data.on('end', () => {
                if (lineBuf.length) {
                    processLine(lineBuf);
                }
                if (sseFormat === 'pfp') {
                    finish(resolve, this._writePfpStreamDone(res, options, fullText));
                } else {
                    res.end();
                    finish(resolve, sanitizeLlmUserText(fullText));
                }
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                if (fullText.length > 0 && sseFormat === 'pfp' && !settled) {
                    if (streamPartialLooksComplete(fullText)) {
                        console.warn(
                            `[aiService] stream error after ${fullText.length} chars — finishing with type=done (${err.message})`
                        );
                        finish(resolve, this._writePfpStreamDone(res, options, fullText));
                        return;
                    }
                    err.__streamBytesSent = fullText.length;
                    err.__streamIncomplete = true;
                }
                failStream(err);
            });
        });
    }

    async _streamRecoverAfterPartial(messages, runtime, res, options, partialSent) {
        console.warn(
            `[aiService] stream truncated at ${partialSent.length} chars — non-stream recovery via getCompletion`
        );
        const text = await this.getCompletion(messages, runtime.effectiveModel);
        let tail = text;
        if (partialSent && text.startsWith(partialSent)) {
            tail = text.slice(partialSent.length);
        }
        if (tail && options.sseFormat === 'pfp') {
            res.write(`data: ${JSON.stringify({ type: 'text', text: tail })}\n\n`);
        } else if (tail) {
            res.write(tail);
        }
        return this._writePfpStreamDone(res, options, text || partialSent);
    }

    async _streamFallbackToNonStream(messages, runtime, res, options = {}) {
        console.warn('[aiService] stream failed with no bytes — fallback to non-stream getCompletion');
        const text = await this.getCompletion(messages, runtime.effectiveModel);
        const sseFormat = options.sseFormat === 'pfp' ? 'pfp' : 'openai';
        if (sseFormat === 'pfp') {
            if (text) {
                res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
            }
            return this._writePfpStreamDone(res, options, text || '');
        }
        if (text) {
            res.write(text);
        }
        res.end();
        return sanitizeLlmUserText(text || '');
    }

    /**
     * Stream completion from LLM provider (OpenRouter / YandexGPT / SiliconFlow / GigaChat)
     * @param {Array} messages - Chat history including system prompt
     * @param {String} model - Model ID
     * @param {Object} res - Express response object to stream to
     * @param {Object} [options]
     * @param {'openai'|'pfp'} [options.sseFormat='openai'] — openai: сырой прокси как у OpenAI (для старых клиентов); pfp: только наши JSON-ивенты type=text|done (без сырого [DONE] и чанков choices)
     * @param {*} [options.trailingSsePayload] — при sseFormat=pfp: один доп. SSE-ивент (объект → JSON) перед type=done
     * @param {string} [options.appendTextBeforeDone] — при sseFormat=pfp: доп. чанк type=text (целиком) перед trailing и done (например ссылка на PDF)
     * @param {boolean} [options.fallbackToNonStream=true] — при обрыве стрима без текста: один non-stream запрос (с retry в getCompletion)
     */
    async streamCompletion(messages, model, res, options = {}) {
        const runtime = this._resolveCallRuntime(model);
        if (!runtime.apiKey) {
            console.error(`❌ ${runtime.missingKeyError}`);
            throw new Error(runtime.missingKeyError);
        }

        try {
            await this._ensureRuntimeAuth(runtime);
        } catch (oauthErr) {
            console.error(`❌ ${runtime.providerLabel} OAuth failed:`, oauthErr.message || oauthErr);
            if (oauthErr.response?.data) {
                console.error('   OAuth body:', JSON.stringify(oauthErr.response.data).substring(0, 300));
            }
            throw oauthErr;
        }

        const maxAttempts = Math.max(1, Number(process.env.OPENROUTER_STREAM_MAX_RETRIES || 2) + 1);
        const allowFallback = options.fallbackToNonStream !== false;

        const keyFingerprint = runtime.apiKey
            ? `${runtime.apiKey.substring(0, 6)}...${runtime.apiKey.substring(runtime.apiKey.length - 6)}`
            : 'N/A';

        console.log(`🚀 Starting AI Request`);
        console.log(`   Provider: ${runtime.providerLabel}`);
        console.log(`   Model: ${runtime.effectiveModel}`);
        console.log(`   Key Fingerprint: ${keyFingerprint}`);

        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Refresh token each retry in case 401 mid-session
                if (runtime.isGigaChat && attempt > 1) {
                    gigachatTokenCache.accessToken = null;
                    gigachatTokenCache.refreshAtMs = 0;
                    await this._ensureRuntimeAuth(runtime);
                }
                return await this._streamCompletionOnce(messages, runtime, res, options);
            } catch (error) {
                lastError = error;
                const bytesSent = Number(error?.__streamBytesSent || 0);
                const retriable = bytesSent === 0 && isRetriableLlmError(error);

                console.error(
                    `❌ ${runtime.providerLabel} stream attempt ${attempt}/${maxAttempts} failed:`,
                    error.message
                );
                if (error.code) console.error(`   code: ${error.code}`);

                if (retriable && attempt < maxAttempts) {
                    const delay = Math.pow(2, attempt) * 500;
                    console.log(`🔄 Stream retry in ${delay / 1000}s (no bytes sent yet)...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }

                if (bytesSent === 0 && allowFallback && options.sseFormat === 'pfp' && !res.writableEnded) {
                    try {
                        return await this._streamFallbackToNonStream(messages, runtime, res, options);
                    } catch (fallbackErr) {
                        console.error('[aiService] non-stream fallback failed:', fallbackErr.message || fallbackErr);
                        lastError = fallbackErr;
                    }
                }

                if (
                    bytesSent > 0 &&
                    error?.__streamIncomplete &&
                    allowFallback &&
                    options.sseFormat === 'pfp' &&
                    !res.writableEnded
                ) {
                    try {
                        const partial = String(error.__partialText || '');
                        return await this._streamRecoverAfterPartial(
                            messages,
                            runtime,
                            res,
                            options,
                            partial
                        );
                    } catch (recoverErr) {
                        console.error('[aiService] partial stream recovery failed:', recoverErr.message || recoverErr);
                        lastError = recoverErr;
                    }
                }

                if (bytesSent > 0 && options.sseFormat === 'pfp' && !res.writableEnded) {
                    console.warn(
                        `[aiService] stream failed after ${bytesSent} chars — emitting type=done so client clears typing`
                    );
                    this._writePfpStreamDone(res, options, '');
                    return '';
                }

                if (!res.writableEnded && options.sseFormat === 'pfp') {
                    res.write(`data: ${JSON.stringify({ type: 'error', message: lastError.message })}\n\n`);
                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    if (typeof res.flush === 'function') {
                        res.flush();
                    }
                    res.end();
                } else if (!res.writableEnded) {
                    const msg = String(lastError.message || lastError).replace(/"/g, '\\"');
                    res.write(`data: {"error": "${msg}"}\n\n`);
                    res.end();
                }
                throw lastError;
            }
        }

        throw lastError || new Error(`${runtime.providerLabel} stream failed`);
    }

    /**
     * Get simple text completion (non-streaming)
     * @param {Array} messages
     * @param {String} model
     * @returns {Promise<String>}
     */
    async getCompletion(messages, model) {
        const runtime = this._resolveCallRuntime(model);
        if (!runtime.apiKey) throw new Error(runtime.missingKeyError);

        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (runtime.isGigaChat) {
                    if (attempt > 1) {
                        gigachatTokenCache.accessToken = null;
                        gigachatTokenCache.refreshAtMs = 0;
                    }
                    await this._ensureRuntimeAuth(runtime);
                }
                const response = await axios.post(
                    `${runtime.baseUrl}/chat/completions`,
                    {
                        model: runtime.effectiveModel,
                        messages: messages,
                        stream: false,
                    },
                    {
                        headers: this._authHeaders(runtime),
                        ...this._axiosExtras(false, runtime),
                    }
                );
                return sanitizeLlmUserText(response.data.choices[0].message.content);
            } catch (error) {
                lastError = error;
                const status = error.response ? error.response.status : 'No Response';
                console.error(
                    `❌ ${runtime.providerLabel} attempt ${attempt}/${maxRetries} failed (Status: ${status}):`,
                    error.message
                );

                if (error.response && error.response.data) {
                    console.error('   Error Data:', JSON.stringify(error.response.data).substring(0, 200));
                }

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`🔄 Retrying in ${delay / 1000}s...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }

        console.error('❌ All AI attempts failed.');
        throw lastError;
    }
}

module.exports = new AiService();
// Export helpers for unit/smoke tests
module.exports.AiService = AiService;
module.exports.resolveProvider = resolveProvider;
module.exports.resolveProviderForCall = resolveProviderForCall;
module.exports.resolveEffectiveModel = resolveEffectiveModel;
module.exports.resolveYandexModelUri = resolveYandexModelUri;
module.exports.resolveGigaChatCredentials = resolveGigaChatCredentials;
module.exports.getGigaChatAccessToken = getGigaChatAccessToken;
module.exports.isRetriableOpenRouterError = isRetriableOpenRouterError;
