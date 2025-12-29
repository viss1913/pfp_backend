const https = require('https');

const payload = JSON.stringify({
    client: {
        sex: 'male',
        birth_date: '1985-12-26',
        avg_monthly_income: 120000,
        assets: [
            { type: 'CASH', amount: 0 }
        ]
    },
    goals: [{
        name: "Пенсия MVP",
        goal_type_id: 1,
        target_amount: 30000000,
        term_months: 180,
        risk_profile: 'BALANCED',
        priority: 1
    }]
});

const options = {
    hostname: 'pfpbackend-production.up.railway.app',
    port: 443,
    path: '/api/client/calculate',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

console.log('Sending payload:', payload);

const req = https.request(options, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response Body:');
        try {
            console.log(JSON.stringify(JSON.parse(data), null, 2));
        } catch (e) {
            console.log(data);
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(payload);
req.end();
