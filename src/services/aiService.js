const axios = require('axios');
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

/**
 * LLM provider: openrouter (default) | yandex | siliconflow
 * Yandex only when AI_PROVIDER=yandex (explicit).
 */
function resolveProvider() {
    const explicit = String(process.env.AI_PROVIDER || '')
        .trim()
        .toLowerCase();
    if (explicit === 'yandex' || explicit === 'yandexgpt') return 'yandex';
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
 * OpenRouter / SiliconFlow model ids (google/..., openai/...) are invalid for Yandex.
 * Force Yandex URI when provider is yandex.
 */
function looksLikeForeignModelId(model) {
    const m = String(model || '').trim();
    if (!m) return false;
    if (m.startsWith('gpt://') || m.startsWith('cls://') || m.startsWith('emb://')) return false;
    if (/^yandexgpt/i.test(m)) return false;
    // openrouter-style: vendor/model or with :suffix
    if (m.includes('/')) return true;
    return false;
}

function resolveDefaultModel(provider) {
    if (provider === 'yandex') {
        return resolveYandexModelUri();
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
    return requested || resolveDefaultModel(provider);
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
        this.isSiliconFlow = this.provider === 'siliconflow';
        this.isOpenRouter = this.provider === 'openrouter';

        let key = '';
        if (this.isYandex) {
            key = process.env.YANDEX_CLOUD_API_KEY || '';
        } else if (this.isSiliconFlow) {
            key = process.env.SILICONFLOW_API_KEY || '';
        } else {
            key = process.env.OPENROUTER_API_KEY || process.env.SILICONFLOW_API_KEY || '';
        }
        key = stripSurroundingQuotes(key);
        this.apiKey = key || null;

        this.folderId = stripSurroundingQuotes(process.env.YANDEX_CLOUD_FOLDER_ID || '') || null;

        if (this.isYandex) {
            this.baseUrl = (
                process.env.YANDEX_AI_BASE_URL ||
                process.env.YANDEX_CLOUD_BASE_URL ||
                'https://ai.api.cloud.yandex.net/v1'
            ).replace(/\/+$/, '');
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
        if (this.isSiliconFlow) return 'SiliconFlow';
        return 'OpenRouter';
    }

    get missingKeyError() {
        if (this.isYandex) return 'YANDEX_CLOUD_API_KEY is not set (AI_PROVIDER=yandex)';
        if (this.isSiliconFlow) return 'SILICONFLOW_API_KEY is not set';
        return 'OPENROUTER_API_KEY is not set';
    }

    /** Headers for chat/completions (OpenAI-compatible). */
    _authHeaders() {
        if (this.isYandex) {
            const headers = {
                Authorization: `Api-Key ${this.apiKey}`,
                'Content-Type': 'application/json',
            };
            if (this.folderId) {
                headers['x-folder-id'] = this.folderId;
            }
            return headers;
        }
        return {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.appName,
        };
    }

    /** Axios extras: OpenRouter proxy only for OpenRouter egress. */
    _axiosExtras(stream = false) {
        if (this.isOpenRouter) {
            return stream ? openrouterStreamAxiosExtras() : openrouterAxiosExtras();
        }
        const timeout = stream
            ? Number(process.env.OPENROUTER_STREAM_TIMEOUT_MS || process.env.OPENROUTER_HTTP_TIMEOUT_MS || 120000)
            : Number(process.env.OPENROUTER_HTTP_TIMEOUT_MS || 60000);
        return { timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : stream ? 120000 : 60000 };
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

    async _streamCompletionOnce(messages, effectiveModel, res, options = {}) {
        const sseFormat = options.sseFormat === 'pfp' ? 'pfp' : 'openai';

        const response = await axios.post(
            `${this.baseUrl}/chat/completions`,
            {
                model: effectiveModel,
                messages: messages,
                stream: true,
            },
            {
                headers: this._authHeaders(),
                responseType: 'stream',
                ...this._axiosExtras(true),
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

    async _streamRecoverAfterPartial(messages, effectiveModel, res, options, partialSent) {
        console.warn(
            `[aiService] stream truncated at ${partialSent.length} chars — non-stream recovery via getCompletion`
        );
        const text = await this.getCompletion(messages, effectiveModel);
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

    async _streamFallbackToNonStream(messages, effectiveModel, res, options = {}) {
        console.warn('[aiService] stream failed with no bytes — fallback to non-stream getCompletion');
        const text = await this.getCompletion(messages, effectiveModel);
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
     * Stream completion from LLM provider (OpenRouter / YandexGPT / SiliconFlow)
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
        if (!this.apiKey) {
            console.error(`❌ ${this.missingKeyError}`);
            throw new Error(this.missingKeyError);
        }

        const effectiveModel = resolveEffectiveModel(this.provider, model);
        const maxAttempts = Math.max(1, Number(process.env.OPENROUTER_STREAM_MAX_RETRIES || 2) + 1);
        const allowFallback = options.fallbackToNonStream !== false;

        const keyFingerprint = this.apiKey
            ? `${this.apiKey.substring(0, 6)}...${this.apiKey.substring(this.apiKey.length - 6)}`
            : 'N/A';

        console.log(`🚀 Starting AI Request`);
        console.log(`   Provider: ${this.providerLabel}`);
        console.log(`   Model: ${effectiveModel}`);
        console.log(`   Key Fingerprint: ${keyFingerprint}`);

        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await this._streamCompletionOnce(messages, effectiveModel, res, options);
            } catch (error) {
                lastError = error;
                const bytesSent = Number(error?.__streamBytesSent || 0);
                const retriable = bytesSent === 0 && isRetriableLlmError(error);

                console.error(
                    `❌ ${this.providerLabel} stream attempt ${attempt}/${maxAttempts} failed:`,
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
                        return await this._streamFallbackToNonStream(messages, effectiveModel, res, options);
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
                            effectiveModel,
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

        throw lastError || new Error(`${this.providerLabel} stream failed`);
    }

    /**
     * Get simple text completion (non-streaming)
     * @param {Array} messages
     * @param {String} model
     * @returns {Promise<String>}
     */
    async getCompletion(messages, model) {
        if (!this.apiKey) throw new Error(this.missingKeyError);

        const effectiveModel = resolveEffectiveModel(this.provider, model);

        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    `${this.baseUrl}/chat/completions`,
                    {
                        model: effectiveModel,
                        messages: messages,
                        stream: false,
                    },
                    {
                        headers: this._authHeaders(),
                        ...this._axiosExtras(false),
                    }
                );
                return sanitizeLlmUserText(response.data.choices[0].message.content);
            } catch (error) {
                lastError = error;
                const status = error.response ? error.response.status : 'No Response';
                console.error(
                    `❌ ${this.providerLabel} attempt ${attempt}/${maxRetries} failed (Status: ${status}):`,
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
module.exports.resolveEffectiveModel = resolveEffectiveModel;
module.exports.resolveYandexModelUri = resolveYandexModelUri;
module.exports.isRetriableOpenRouterError = isRetriableOpenRouterError;
