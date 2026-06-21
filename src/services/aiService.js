const axios = require('axios');
const { sanitizeLlmUserText } = require('../utils/sanitizeLlmUserText');
require('dotenv').config();

class AiService {
    constructor() {
        let key = process.env.OPENROUTER_API_KEY || process.env.SILICONFLOW_API_KEY || ''; // Fallback for transition
        key = key.trim();
        // Remove surrounding quotes if present
        if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
            key = key.slice(1, -1);
        }
        this.apiKey = key || null;

        // Detect provider
        this.isSiliconFlow = !process.env.OPENROUTER_API_KEY && !!process.env.SILICONFLOW_API_KEY;

        if (this.isSiliconFlow) {
            this.baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
        } else {
            this.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
        }

        this.siteUrl = process.env.App_URL || 'https://pfp.app'; // Optional: for OpenRouter rankings
        this.appName = 'PFP Constructor Bot'; // Optional: for OpenRouter rankings
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

    /**
     * Stream completion from OpenRouter
     * @param {Array} messages - Chat history including system prompt
     * @param {String} model - Model ID
     * @param {Object} res - Express response object to stream to
     * @param {Object} [options]
     * @param {'openai'|'pfp'} [options.sseFormat='openai'] — openai: сырой прокси как у OpenAI (для старых клиентов); pfp: только наши JSON-ивенты type=text|done (без сырого [DONE] и чанков choices)
     * @param {*} [options.trailingSsePayload] — при sseFormat=pfp: один доп. SSE-ивент (объект → JSON) перед type=done
     * @param {string} [options.appendTextBeforeDone] — при sseFormat=pfp: доп. чанк type=text (целиком) перед trailing и done (например ссылка на PDF)
     */
    async streamCompletion(messages, model, res, options = {}) {
        if (!this.apiKey) {
            console.error('❌ OPENROUTER_API_KEY is missing');
            throw new Error('OPENROUTER_API_KEY is not set');
        }

        const sseFormat = options.sseFormat === 'pfp' ? 'pfp' : 'openai';

        const defaultModel = process.env.OPENROUTER_MODEL
            ? process.env.OPENROUTER_MODEL
            : this.isSiliconFlow
                ? 'deepseek-ai/DeepSeek-V3'
                : 'google/gemma-3-27b-it';

        const effectiveModel = model || defaultModel;

        const keyFingerprint = this.apiKey ? `${this.apiKey.substring(0, 6)}...${this.apiKey.substring(this.apiKey.length - 6)}` : 'N/A';

        console.log(`🚀 Starting AI Request`);
        console.log(`   Provider: OpenRouter`);
        console.log(`   Model: ${effectiveModel}`);
        console.log(`   Key Fingerprint: ${keyFingerprint}`);

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: effectiveModel,
                    messages: messages,
                    stream: true
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': this.siteUrl, // Required by OpenRouter
                        'X-Title': this.appName       // Required by OpenRouter
                    },
                    responseType: 'stream'
                }
            );

            return await new Promise((resolve, reject) => {
                let fullText = '';
                let lineBuf = '';

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

                response.data.on('data', (chunk) => {
                    feedChunk(chunk);
                });

                response.data.on('end', () => {
                    if (lineBuf.length) {
                        processLine(lineBuf);
                    }
                    if (sseFormat === 'pfp') {
                        const extra = options.appendTextBeforeDone;
                        if (extra && String(extra).length > 0) {
                            res.write(`data: ${JSON.stringify({ type: 'text', text: String(extra) })}\n\n`);
                        }
                        if (options.trailingSsePayload != null) {
                            res.write(`data: ${JSON.stringify(options.trailingSsePayload)}\n\n`);
                        }
                        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    }
                    res.end();
                    const tail =
                        options.appendTextBeforeDone && String(options.appendTextBeforeDone).length > 0
                            ? String(options.appendTextBeforeDone)
                            : '';
                    resolve(sanitizeLlmUserText(fullText + tail));
                });

                response.data.on('error', (err) => {
                    console.error('Stream error:', err);
                    const msg = String(err.message || err).replace(/"/g, '\\"');
                    if (sseFormat === 'pfp') {
                        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
                    } else {
                        res.write(`data: {"error": "${msg}"}\n\n`);
                    }
                    res.end();
                    reject(err);
                });
            });
        } catch (error) {
            console.error('❌ OpenRouter API Error:');
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                // Try to read stream error if possible, otherwise log data
                if (error.response.data && !error.response.data.on) {
                    console.error(`   Data:`, error.response.data);
                }
            } else {
                console.error(`   Message: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get simple text completion (non-streaming)
     * @param {Array} messages 
     * @param {String} model 
     * @returns {Promise<String>}
     */
    async getCompletion(messages, model) {
        if (!this.apiKey) throw new Error('OPENROUTER_API_KEY is not set');

        // Default model can be overridden via OPENROUTER_MODEL
        const defaultModel = process.env.OPENROUTER_MODEL
            ? process.env.OPENROUTER_MODEL
            : this.isSiliconFlow
                ? 'deepseek-ai/DeepSeek-V3'
                : 'google/gemma-3-27b-it';

        const effectiveModel = model || defaultModel;

        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    `${this.baseUrl}/chat/completions`,
                    {
                        model: effectiveModel,
                        messages: messages,
                        stream: false
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': this.siteUrl,
                            'X-Title': this.appName
                        },
                        timeout: 30000 // 30 seconds timeout
                    }
                );
                return sanitizeLlmUserText(response.data.choices[0].message.content);
            } catch (error) {
                lastError = error;
                const status = error.response ? error.response.status : 'No Response';
                console.error(`❌ OpenRouter attempt ${attempt}/${maxRetries} failed (Status: ${status}):`, error.message);

                if (error.response && error.response.data) {
                    console.error('   Error Data:', JSON.stringify(error.response.data).substring(0, 200));
                }

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`🔄 Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error('❌ All AI attempts failed.');
        throw lastError;
    }
}

module.exports = new AiService();
