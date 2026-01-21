const axios = require('axios');
require('dotenv').config();

class AiService {
    constructor() {
        this.apiKey = process.env.SILICONFLOW_API_KEY ? process.env.SILICONFLOW_API_KEY.trim() : null;
        this.baseUrl = 'https://api.siliconflow.cn/v1';
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
        let effectiveModel = model || 'Qwen/Qwen2.5-7B-Instruct';
        if (effectiveModel.includes('google') || effectiveModel.includes('gemini')) {
            console.warn(`⚠️  Legacy model detected (${effectiveModel}), switching to Qwen/Qwen2.5-7B-Instruct`);
            effectiveModel = 'Qwen/Qwen2.5-7B-Instruct';
        }

        console.log(`🚀 Starting AI Request`);
        console.log(`   Provider: SiliconFlow`);
        console.log(`   Model: ${effectiveModel} (Original: ${model})`);
        console.log(`   Key Configured: ${this.apiKey.startsWith('sk-') ? 'Yes (starts with sk-)' : 'WARNING: Key does not start with sk-'}`);
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
                // Try to extract the exact error message safely
                const errorData = error.response.data;
                const message = errorData?.error?.message || JSON.stringify(errorData);
                const code = errorData?.error?.code || 'unknown';
                console.error(`   SiliconFlow Message: ${message}`);
                console.error(`   SiliconFlow Code: ${code}`);
            } else {
                console.error(`   Message: ${error.message}`);
            }
            throw error;
        }
    }
}

module.exports = new AiService();
