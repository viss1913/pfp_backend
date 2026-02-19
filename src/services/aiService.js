const axios = require('axios');
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
        return template.replace('{{agent_name}}', agent.name || 'Agent');
    }

    /**
     * Stream completion from OpenRouter
     * @param {Array} messages - Chat history including system prompt
     * @param {String} model - Model ID
     * @param {Object} res - Express response object to stream to
     */
    async streamCompletion(messages, model, res) {
        if (!this.apiKey) {
            console.error('❌ OPENROUTER_API_KEY is missing');
            throw new Error('OPENROUTER_API_KEY is not set');
        }

        const defaultModel = this.isSiliconFlow
            ? 'deepseek-ai/DeepSeek-V3'
            : 'google/gemini-3-flash-preview';

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

            // Pipe the data directly to the client
            response.data.on('data', (chunk) => {
                res.write(chunk);
            });

            response.data.on('end', () => {
                res.end();
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.write(`data: {"error": "${err.message}"}\n\n`);
                res.end();
            });

            // Return full text promise for logging/saving purposes
            return new Promise((resolve) => {
                let fullText = '';
                response.data.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                                const json = JSON.parse(line.substring(6));
                                if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                                    fullText += json.choices[0].delta.content;
                                }
                            } catch (e) {
                                // ignore parse error for partial chunks
                            }
                        }
                    }
                });
                response.data.on('end', () => resolve(fullText));
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

        // Default to Gemini Flash Lite if not specified
        const defaultModel = this.isSiliconFlow
            ? 'deepseek-ai/DeepSeek-V3'
            : 'google/gemini-3-flash-preview';

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
                return response.data.choices[0].message.content;
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
