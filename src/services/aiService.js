const axios = require('axios');
require('dotenv').config();

class AiService {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseUrl = 'https://openrouter.ai/api/v1';
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
            throw new Error('OPENROUTER_API_KEY is not set');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: model || 'google/gemini-2.0-flash-exp:free',
                    messages: messages,
                    stream: true
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://pfp.app', // Required by OpenRouter
                        'X-Title': 'PFP AI'
                    },
                    responseType: 'stream'
                }
            );

            // Pipe the data directly to the client
            response.data.on('data', (chunk) => {
                // OpenRouter returns standard SSE format: "data: { ...JSON... }\n\n"
                // We can just pass it through, or parse/sanitize if needed.
                // For simplicity/speed, pass through.
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

            // Return a promise that resolves when full text is collected (if specific logic needed)
            // But for streaming to res, we mostly trust the pipe.
            // We do need to capture the Full Text to save to history, so we'll implement a collecting listener.

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
            console.error('OpenRouter API Error:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new AiService();
