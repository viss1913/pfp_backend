const maxBotService = require('./src/services/maxBotService');
require('dotenv').config();

const token = process.argv[2];
const webhookUrl = process.argv[3];
const secret = process.argv[4] || 'test_secret';

if (!token || !webhookUrl) {
    console.log('Usage: node test_max_webhook.js <token> <webhookUrl> [secret]');
    process.exit(1);
}

async function test() {
    try {
        console.log(`Setting webhook: ${webhookUrl}`);
        const result = await maxBotService.setWebhook(token, webhookUrl, secret);
        console.log('Success:', result);
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

test();
