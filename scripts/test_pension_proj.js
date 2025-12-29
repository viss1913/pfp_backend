
const http = require('http');

const payload = {
    client: {
        birth_date: '1980-01-01', // 45 years old approx
        sex: 'male',
        avg_monthly_income: 140000,
        assets: []
    },
    goals: [
        {
            goal_type_id: 3, // INVESTMENT
            name: "My Investment Plan",
            risk_profile: "BALANCED",
            initial_capital: 100000,
            monthly_replenishment: 10000,
            term_months: 180, // 15 years
            inflation_rate: 5,
            start_date: "2025-01-01"
            // No target_amount
        }
    ]
};

const data = JSON.stringify(payload);

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/client/calculate',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'x-agent-id': '1'
    }
};

const req = http.request(options, (res) => {
    let responseBody = '';

    res.on('data', (chunk) => {
        responseBody += chunk;
    });

    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(responseBody);
            const investmentGoal = parsed.goals.find(g => g.goal_id === 3);
            if (investmentGoal) {
                console.log('--- INVESTMENT GOAL RESULT ---');
                console.log(JSON.stringify(investmentGoal, null, 2));

                // Also print specific fields for quick verification
                console.log('Projected Value:', investmentGoal.projected_value);
                console.log('Total Client Investment:', investmentGoal.total_client_investment);
                console.log('Total State Benefit:', investmentGoal.total_state_benefit);
                console.log('Total Investment Income:', investmentGoal.total_investment_income);
                console.log('Yield Annual %:', investmentGoal.yield_annual_percent);
            } else {
                console.log('Investment goal not found in response');
                console.log(JSON.stringify(parsed.goals.map(g => g.goal_type), null, 2));
            }
        } else {
            console.error(`Request failed with status: ${res.statusCode}`);
            console.error('Body:', responseBody);
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
