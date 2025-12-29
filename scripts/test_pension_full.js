const https = require('http');
const fs = require('fs');
const path = require('path');

const RAILWAY_URL = 'http://localhost:3001/api/client/calculate';
const OUTPUT_FILE = path.join(__dirname, 'pension_railway_full.json');

const payload = {
    client: {
        birth_date: '1990-01-01',
        sex: 'male',
        avg_monthly_income: 110000
    },
    goals: [
        {
            goal_type_id: 1,
            name: 'Моя Пенсия',
            target_amount: 80000,
            term_months: 360,
            initial_capital: 70000,
            risk_profile: 'BALANCED',
            start_date: '2025-01-01',
            inflation_rate: 4
        }
    ]
};

function performRequest(url, data) {
    return new Promise((resolve, reject) => {
        console.log(`Sending request to: ${url}`);

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-agent-id': '1'
            },
            timeout: 30000 // 30s timeout
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Status ${res.statusCode}: ${body}`));
                } else {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

async function run() {
    console.log('--- INPUT PAYLOAD ---');
    console.log(JSON.stringify(payload, null, 2));

    try {
        console.log('\n--- EXECUTING REQUEST ---');
        const result = await performRequest(RAILWAY_URL, payload);

        console.log('\n--- SUCCESS ---');
        console.log(`Saving full response to ${OUTPUT_FILE}`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

        // Display key parts of the response immediately for the user
        if (result.goals && result.goals[0]) {
            const g = result.goals[0];
            console.log('\n=== SUMMARY ===');
            console.log(JSON.stringify(g.summary || {}, null, 2));
            console.log('\n=== PENSION GAP ===');
            console.log(JSON.stringify(g.pension_gap || {}, null, 2));
            console.log('\n=== PORTFOLIO STRUCTURE ===');
            console.log(JSON.stringify(g.portfolio_structure || {}, null, 2));
            console.log('\n=== COFINANCING (PDS) ===');
            console.log(JSON.stringify(g.pds_cofinancing || 'Not Applied', null, 2));
        } else {
            console.log('Response structure unexpected:', Object.keys(result));
        }

    } catch (err) {
        console.error(`\n[ERROR] ${err.message}`);
    }
}

run();
