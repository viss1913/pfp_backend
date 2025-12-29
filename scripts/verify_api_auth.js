require('dotenv').config({ override: true });
const http = require('http');

const API_KEY = process.env.TEST_API_KEY || process.argv[2];
const BASE_URL = process.env.API_URL || 'http://localhost:3001';

if (!API_KEY) {
    console.error('Usage: node scripts/verify_api_auth.js <api_key>');
    console.error('Or set TEST_API_KEY env var.');
    process.exit(1);
}

// Simple wrapper for HTTP request
function makeRequest(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method: 'POST', // first-run is POST
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: data ? JSON.parse(data) : {},
                    headers: res.headers
                });
            });
        });

        req.on('error', reject);

        // Payload for first-run (minimal valid)
        const payload = JSON.stringify({
            goals: [{
                goal_type_id: 1,
                name: 'Test Auth Goal',
                target_amount: 1000000,
                risk_profile: 'BALANCED'
            }],
            client: {
                first_name: 'Auth',
                last_name: 'Test',
                avg_monthly_income: 50000
            }
        });

        req.write(payload);
        req.end();
    });
}

async function runTest() {
    console.log(`Testing API Auth against ${BASE_URL}...`);
    console.log(`Using Key: ${API_KEY.substring(0, 10)}... (masked)`);

    try {
        // 1. Test with Valid Key
        console.log('\nRequest 1: Valid Key...');
        const res1 = await makeRequest('/api/client/first-run', {
            'x-api-key': API_KEY
        });

        if (res1.statusCode === 200 || res1.statusCode === 201) {
            console.log('✅ Success! Status:', res1.statusCode);
            const body = res1.body;
            console.log('Client ID returned:', body.client_id);
        } else {
            console.error('❌ Failed! Status:', res1.statusCode);
            console.error('Body:', res1.body);
        }

        // 2. Test with Invalid Key
        console.log('\nRequest 2: Invalid Key...');
        const res2 = await makeRequest('/api/client/first-run', {
            'x-api-key': 'pk_live_INVALID_KEY_12345'
        });

        if (res2.statusCode === 401) {
            console.log('✅ Correctly blocked (401).');
        } else {
            console.error('❌ Unexpected status:', res2.statusCode);
        }

    } catch (e) {
        console.error('Test Error:', e.message);
        console.log('Make sure the server is running!');
    }
}

runTest();
