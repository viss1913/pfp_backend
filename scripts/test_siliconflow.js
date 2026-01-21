require('dotenv').config();
const axios = require('axios');

async function testSiliconFlow() {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
        console.error('Error: SILICONFLOW_API_KEY not found in environment variables.');
        console.log('Please ensure SILICONFLOW_API_KEY is set in your .env file.');
        return;
    }

    console.log('Testing SiliconFlow connection...');
    console.log(`Using API Key: ${apiKey.substring(0, 5)}...`);

    try {
        const response = await axios.post(
            'https://api.siliconflow.cn/v1/chat/completions',
            {
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Reply with "Connection Successful!"' }
                ],
                stream: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        if (response.data.choices && response.data.choices.length > 0) {
            console.log('Content:', response.data.choices[0].message.content);
            console.log('\x1b[32m%s\x1b[0m', 'Test PASSED: Successfully received response from SiliconFlow.');
        } else {
            console.log('\x1b[33m%s\x1b[0m', 'Test WARNING: Response format unexpected.');
        }

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Test FAILED');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

testSiliconFlow();
