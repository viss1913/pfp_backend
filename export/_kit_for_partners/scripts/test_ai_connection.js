/**
 * Минимальный smoke OpenRouter с прокси (как в PFP).
 * Положить в scripts/ целевого проекта и поправить путь к openrouterProxy.
 */
require('dotenv').config();
const axios = require('axios');
const path = require('path');

const utilPath = path.join(__dirname, '..', 'openrouterProxy.js');
const { openrouterAxiosExtras } = require(
    require('fs').existsSync(utilPath)
        ? utilPath
        : path.join(__dirname, '..', '..', 'src', 'utils', 'openrouterProxy.js')
);

async function main() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it';

    console.log('--- AI Connection Test ---');
    console.log('Base URL:', baseUrl);
    console.log('OPENROUTER_API_KEY present:', !!apiKey);
    if (!apiKey) {
        console.error('❌ Set OPENROUTER_API_KEY');
        process.exit(1);
    }
    console.log('Using Key:', apiKey.substring(0, 6) + '...' + apiKey.slice(-4));

    try {
        const response = await axios.post(
            `${baseUrl}/chat/completions`,
            { model, messages: [{ role: 'user', content: 'Hello' }], stream: false },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://pfp.app',
                    'X-Title': 'OpenRouter Proxy Smoke',
                },
                ...openrouterAxiosExtras(),
            }
        );
        console.log('✅ Connection Successful!');
        console.log('Response:', response.data.choices[0].message.content);
    } catch (error) {
        console.error('❌ Request Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Message:', error.message);
        }
        process.exit(1);
    }
}

main();
