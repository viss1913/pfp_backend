const axios = require('axios');
require('dotenv').config();

class AiService {
    constructor() {
        let key = process.env.SILICONFLOW_API_KEY || '';
        key = key.trim();
        // Remove surrounding quotes if present (common mistake in env vars)
        if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
            key = key.slice(1, -1);
        }
        this.apiKey = key || null;
        // Updated to use GLOBAL endpoint (.com) by default as per dev feedback
        this.baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.com/v1';
    }

    injectContext(template, agent) {
        if (!template) return '';
        return template.replace('{{agent_name}}', agent.name || 'Agent');
    }

    /**
     * Stream completion from SiliconFlow
     * @param {Array} messages - Chat history including system prompt
     * @param {String} model - Model ID
     * @param {Object} res - Express response object to stream to
     */
    async streamCompletion(messages, model, res) {
        if (!this.apiKey) {
            console.error('❌ SILICONFLOW_API_KEY is missing');
            throw new Error('SILICONFLOW_API_KEY is not set');
        }

        // FORCE OVERRIDE: If the DB still has old Gemini models, switch to Qwen
        let effectiveModel = model || 'Qwen/Qwen2.5-14B-Instruct';
        if (effectiveModel.includes('google') || effectiveModel.includes('gemini')) {
            console.warn(`⚠️  Legacy model detected (${effectiveModel}), switching to Qwen/Qwen2.5-14B-Instruct`);
            effectiveModel = 'Qwen/Qwen2.5-14B-Instruct';
        }

        const keyFingerprint = this.apiKey ? `${this.apiKey.substring(0, 6)}...${this.apiKey.substring(this.apiKey.length - 6)}` : 'N/A';

        console.log(`🚀 Starting AI Request`);
        console.log(`   Provider: SiliconFlow`);
        console.log(`   Model: ${effectiveModel} (Original: ${model})`);
        console.log(`   Key Configured: ${this.apiKey.startsWith('sk-') ? 'Yes' : 'No'}`);
        console.log(`   Key Fingerprint: ${keyFingerprint}`);
        console.log(`   Key Length: ${this.apiKey.length}`);

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
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream'
                }
            );

            // Pipe the data directly to the client
            response.data.on('data', (chunk) => {
                // SiliconFlow (OpenAI compatible) returns standard SSE format: "data: { ...JSON... }\n\n"
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
            console.error('❌ SiliconFlow API Error Detail:');

            if (error.response) {
                console.error(`   Status: ${error.response.status}`);

                try {
                    // Since responseType is 'stream', data is a stream, not JSON!
                    // We must collect the stream content to see the error message.
                    if (error.response.data && typeof error.response.data.on === 'function') {
                        const chunks = [];
                        for await (const chunk of error.response.data) {
                            chunks.push(chunk);
                        }
                        const bodyBuffer = Buffer.concat(chunks);
                        const bodyText = bodyBuffer.toString('utf8');

                        console.error(`   SiliconFlow Response Body: ${bodyText}`);
                    } else {
                        // If it's not a stream (unexpected), try to log it safely
                        console.error(`   Data (non-stream):`, error.response.data);
                    }
                } catch (readError) {
                    console.error('   Error reading error stream:', readError.message);
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
        if (!this.apiKey) throw new Error('SILICONFLOW_API_KEY is not set');

        let effectiveModel = model || 'Qwen/Qwen2.5-14B-Instruct';
        if (effectiveModel.includes('google') || effectiveModel.includes('gemini')) {
            effectiveModel = 'Qwen/Qwen2.5-14B-Instruct';
        }

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
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000 // 30 seconds timeout
                    }
                );
                return response.data.choices[0].message.content;
            } catch (error) {
                lastError = error;
                const status = error.response ? error.response.status : 'No Response';
                console.error(`❌ SiliconFlow attempt ${attempt}/${maxRetries} failed (Status: ${status}):`, error.message);

                // If it's a 500 error or timeout, we might want to switch model on the last attempt
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`🔄 Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // On second and third attempt, if it was a 500, try a different stable model as fallback
                    if (status >= 500 && attempt === 2) {
                        console.warn('⚠️ Switching to fallback model: Qwen/Qwen2.5-7B-Instruct');
                        effectiveModel = 'Qwen/Qwen2.5-7B-Instruct';
                    }
                }
            }
        }

        console.error('❌ All AI attempts failed.');
        throw lastError;
    }
}

module.exports = new AiService();
