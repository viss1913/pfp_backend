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
            throw new Error('SILICONFLOW_API_KEY is not set');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: model || 'Qwen/Qwen2.5-7B-Instruct',
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
            console.error('SiliconFlow API Error:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new AiService();
