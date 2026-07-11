require('dotenv').config();
const axios = require('axios');
const { openrouterAxiosExtras } = require('../src/utils/openrouterProxy');

async function testConnection() {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const siliconFlowKey = process.env.SILICONFLOW_API_KEY;

    let baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    // Auto-switch to SiliconFlow if only that key is present
    if (!openRouterKey && siliconFlowKey && !process.env.OPENROUTER_BASE_URL) {
        baseUrl = 'https://api.siliconflow.cn/v1';
        console.log('🔄 Switching to SiliconFlow API URL automatically');
    }

    console.log('--- AI Connection Test ---');
    console.log('Base URL:', baseUrl);
    console.log('OPENROUTER_API_KEY present:', !!openRouterKey);
    console.log('SILICONFLOW_API_KEY present:', !!siliconFlowKey);

    const apiKey = openRouterKey || siliconFlowKey;

    if (!apiKey) {
        console.error('❌ No API Key found!');
        return;
    }

    console.log('Using Key:', apiKey.substring(0, 6) + '...' + apiKey.slice(-4));

    // Test simple completion
    try {
        console.log('Sending test request...');
        const response = await axios.post(
            `${baseUrl}/chat/completions`,
            {
                model: 'deepseek-ai/DeepSeek-V3', // Try a standard SiliconFlow model
                messages: [{ role: 'user', content: 'Hello' }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
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
    }
}

testConnection();
