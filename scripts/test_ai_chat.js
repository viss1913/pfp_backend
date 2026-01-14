const axios = require('axios');

async function testChat() {
    try {
        console.log('1. Logging in to PRODUCTION...');
        const loginRes = await axios.post('https://pfpbackend-production.up.railway.app/api/auth/login', {
            email: 'testuser@example.com',
            password: 'Test1234'
        });

        const token = loginRes.data.token;
        console.log('Login successful. Token:', token.substring(0, 20) + '...');

        console.log('\n2. Sending Chat Message to AI CRM (id: 1)...');
        // Using the standard path now that we assume the prod build has the route alias?
        // Or should we test the path the frontend is likely using?
        // The frontend likely uses /api/chat/stream or /api/pfp/ai/chat/stream
        // Let's try /api/chat/stream first as that was the suspect.
        const response = await axios.post('https://pfpbackend-production.up.railway.app/api/chat/stream',
            {
                assistant_id: 1, // AI CRM
                message: 'Hello! Are you working?'
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                    // 'Accept': 'text/event-stream' // Optional but good practice
                },
                responseType: 'stream'
            }
        );

        console.log('Request sent. Waiting for stream...');

        response.data.on('data', (chunk) => {
            console.log('Received chunk:', chunk.toString());
        });

        response.data.on('end', () => {
            console.log('\nStream ended.');
        });

        response.data.on('error', (err) => {
            console.error('Stream Error:', err);
        });

    } catch (err) {
        console.error('Test Failed:', err.response ? err.response.data : err.message);
    }
}

testChat();
