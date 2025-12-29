const http = require('http');
const fs = require('fs');
const path = require('path');

const URL = 'http://localhost:3001/api/client/calculate';
const OUTPUT_FILE = path.join(__dirname, 'pension_pure_output.json');

const payload = {
    "client": {
        "birth_date": "1990-01-01",
        "sex": "male",
        "avg_monthly_income": 110000
    },
    "goals": [
        {
            "goal_type_id": 1,
            "name": "Моя Пенсия",
            "target_amount": 80000,
            "term_months": 360,
            "initial_capital": 70000,
            "risk_profile": "BALANCED",
            "start_date": "2025-01-01",
            "inflation_rate": 4
        }
    ]
};

console.log('--- INPUT PAYLOAD ---');
console.log(JSON.stringify(payload, null, 2));

const options = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-agent-id': 1
    }
};

console.log(`\n--- EXECUTING REQUEST ---`);
console.log(`Sending request to: ${URL}`);

const req = http.request(URL, options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`\n[ERROR] Status Code: ${res.statusCode}`);
            console.error('Response:', data);
            process.exit(1);
        }

        try {
            const parsedData = JSON.parse(data);

            // FILTER: Keep only Pension Goal
            if (parsedData.goals) {
                parsedData.goals = parsedData.goals.filter(g => g.goal_type === 'PENSION');
                console.log(`\n[FILTER] Filtered out ${parsedData.summary.goals_count - parsedData.goals.length} non-pension goals.`);
                parsedData.summary.goals_count = parsedData.goals.length;
            }

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(parsedData, null, 2));
            console.log(`\n--- SUCCESS ---`);
            console.log(`Saved pure pension response to ${OUTPUT_FILE}`);

            if (parsedData.goals && parsedData.goals.length > 0) {
                const pension = parsedData.goals[0];
                console.log('\n=== PENSION VERIFICATION ===');
                console.log('IPK Est:', pension.state_pension?.ipk_est);
                console.log('State Pension (2055):', pension.state_pension?.state_pension_monthly_future);
                console.log('State Pension (2025):', pension.state_pension?.state_pension_monthly_current);
                console.log('Pension Gap (Current):', pension.pension_gap?.gap_monthly_current);
                console.log('Rec. Replenishment:', pension.summary?.monthly_replenishment);
                console.log('Total State Benefit (PDS):', pension.summary?.state_benefit);
            } else {
                console.warn('No PENSION goal found in response!');
            }

        } catch (e) {
            console.error('Failed to parse JSON:', e);
            console.log('Raw data:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`\n[ERROR] Request failed: ${e.message}`);
});

req.setTimeout(60000, () => {
    console.error('\n[ERROR] Request timed out');
    req.destroy();
});

req.write(JSON.stringify(payload));
req.end();
