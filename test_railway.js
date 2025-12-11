const https = require('https');

const railwayUrl = 'pfpbackend-production.up.railway.app';

const testData = {
    goals: [
        {
            goal_type_id: 4,  // OTHER (Прочее)
            name: "Прочее",
            target_amount: 5000000,
            term_months: 60,
            risk_profile: "CONSERVATIVE",
            initial_capital: 100000,
            inflation_rate: 4.0
        }
    ]
};

const postData = JSON.stringify(testData);

const options = {
    hostname: railwayUrl,
    port: 443,
    path: '/api/client/calculate',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('Отправка запроса на расчет для цели OTHER...');
console.log('URL: https://' + railwayUrl + options.path);
console.log('Данные:', JSON.stringify(testData, null, 2));
console.log('\nОжидание ответа...\n');

const req = https.request(options, (res) => {
    console.log(`Статус: ${res.statusCode} ${res.statusMessage}`);
    
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('\nОтвет сервера:');
        try {
            const parsed = JSON.parse(data);
            console.log(JSON.stringify(parsed, null, 2));
            
            if (res.statusCode === 200 && parsed.results && parsed.results.length > 0) {
                const result = parsed.results[0];
                if (result.error) {
                    console.log('\n❌ Ошибка:', result.error);
                } else {
                    console.log('\n✅ Расчет успешен!');
                    console.log(`Портфель: ${result.portfolio?.name || 'N/A'}`);
                    console.log(`Рекомендуемое пополнение: ${result.financials?.recommended_replenishment?.toFixed(2) || 'N/A'} руб/мес`);
                    console.log(`Капитальный разрыв: ${result.financials?.capital_gap?.toFixed(2) || 'N/A'} руб`);
                }
            }
        } catch (e) {
            console.log('Ответ (не JSON):');
            console.log(data);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Ошибка: ${e.message}`);
});

req.write(postData);
req.end();



