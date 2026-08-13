/**
 * Пример: любой сервис с axios → OpenRouter через SOCKS.
 * Скопируй паттерн в свой aiService / llmClient.
 */
require('dotenv').config();
const axios = require('axios');
const { openrouterAxiosExtras } = require('../openrouterProxy');
// в целевом проекте: require('../utils/openrouterProxy')

async function chatCompletion(messages, model) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const effectiveModel = model || process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it';

    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        { model: effectiveModel, messages, stream: false },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.APP_URL || 'https://your-app.example',
                'X-Title': process.env.APP_NAME || 'Your App',
            },
            ...openrouterAxiosExtras(),
        }
    );

    return response.data.choices[0].message.content;
}

// Стриминг — те же ...openrouterAxiosExtras(), плюс responseType: 'stream'
async function chatCompletionStream(messages, model, onChunk) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        { model, messages, stream: true },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            responseType: 'stream',
            ...openrouterAxiosExtras(),
        }
    );

    return new Promise((resolve, reject) => {
        let full = '';
        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter((l) => l.startsWith('data: '));
            for (const line of lines) {
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') continue;
                try {
                    const json = JSON.parse(payload);
                    const piece = json.choices?.[0]?.delta?.content;
                    if (piece) {
                        full += piece;
                        onChunk?.(piece);
                    }
                } catch (_) { /* skip partial json */ }
            }
        });
        response.data.on('end', () => resolve(full));
        response.data.on('error', reject);
    });
}

module.exports = { chatCompletion, chatCompletionStream };
