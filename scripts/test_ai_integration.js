const axios = require('axios');
const EventSource = require('eventsource');

const API_URL = 'http://localhost:3000/api';
const ADMIN_API_URL = 'http://localhost:3000/api/admin';
const AGENT_API_URL = 'http://localhost:3000/api/pfp/ai';

// You need a valid token. For local testing, you might need to login first or use a hardcoded dev token.
// run: node scripts/login_and_get_token.js to get one, or set it here.
const TOKEN = process.env.TEST_TOKEN || 'YOUR_JWT_TOKEN';

async function testAdminFlow() {
    console.log('\n--- Testing Admin Flow ---');
    try {
        const config = { headers: { Authorization: `Bearer ${TOKEN}` } };

        // 1. List
        console.log('Listing assistants...');
        let res = await axios.get(`${ADMIN_API_URL}/ai-assistants`, config);
        console.log('Assistants:', res.data.length);

        // 2. Create
        console.log('Creating Test Assistant...');
        res = await axios.post(`${ADMIN_API_URL}/ai-assistants`, {
            name: 'Test Bot',
            slug: 'test-bot-' + Date.now(),
            context_template: 'You are a test bot.'
        }, config);
        const newId = res.data.id;
        console.log('Created ID:', newId);

        // 3. Update
        console.log('Updating Test Assistant...');
        await axios.put(`${ADMIN_API_URL}/ai-assistants/${newId}`, {
            name: 'Test Bot Updated',
            context_template: 'You are an updated test bot.',
            is_active: true
        }, config);
        console.log('Updated.');

        // 4. Delete
        // await axios.delete(`${ADMIN_API_URL}/ai-assistants/${newId}`, config);
        // console.log('Deleted.');

        return newId; // Return ID to test chat with
    } catch (err) {
        console.error('Admin Flow Error:', err.response?.data || err.message);
        return null;
    }
}

async function testAgentFlow(assistantId) {
    console.log('\n--- Testing Agent Flow ---');
    if (!assistantId) {
        console.log('Skipping Agent Flow (no assistant ID)');
        return;
    }
    const config = { headers: { Authorization: `Bearer ${TOKEN}` } };

    try {
        // 1. List
        console.log('Listing available assistants...');
        const res = await axios.get(`${AGENT_API_URL}/assistants`, config);
        console.log('Available:', res.data.map(a => a.name));

        // 2. Chat Streaming
        console.log(`Starting Chat with ID ${assistantId}...`);

        // Note: axios doesn't handle SSE natively well for nodejs in a simple way for just logging.
        // We will use standard http request with stream responseType to verify we get chunks.

        const response = await axios.post(`${AGENT_API_URL}/chat/stream`, {
            assistant_id: assistantId,
            message: 'Hello, are you working?'
        }, {
            ...config,
            responseType: 'stream'
        });

        console.log('Stream started. Listening for chunks...');

        response.data.on('data', (chunk) => {
            console.log('Received chunk:', chunk.toString());
        });

        response.data.on('end', () => {
            console.log('Stream ended.');
        });

    } catch (err) {
        console.error('Agent Flow Error:', err.response?.data || err.message);
    }
}

async function run() {
    if (TOKEN === 'YOUR_JWT_TOKEN') {
        console.error('Please set TEST_TOKEN env var or edit script with a valid bearer token.');
        // return;
    }

    // For now, let's assume manual testing or env var set.
    // If you want me to try to verify, I need a token.
    // I can try to run `test_api_auth.js` logic to get a token if simple auth works.

    const newId = await testAdminFlow();
    if (newId) {
        await testAgentFlow(newId);
    }
}

run();
