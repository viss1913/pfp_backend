/**
 * Тестовый скрипт для проверки расчета на Railway
 * Использование: node test_railway_calculation.js <railway-url>
 * Пример: node test_railway_calculation.js https://pfp-backend-production.up.railway.app
 */

const http = require('http');
const https = require('https');

const railwayUrl = process.argv[2] || 'https://pfp-backend-production.up.railway.app';

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

// Определяем протокол
const isHttps = railwayUrl.startsWith('https');
const client = isHttps ? https : http;

// Парсим URL
const url = new URL(railwayUrl);
const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: '/api/client/calculate',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('='.repeat(60));
console.log('Тестирование расчета для цели OTHER на Railway');
console.log('='.repeat(60));
console.log(`URL: ${railwayUrl}`);
console.log(`Эндпоинт: ${options.path}`);
console.log('\nОтправляемые данные:');
console.log(JSON.stringify(testData, null, 2));
console.log('\nОжидание ответа...\n');

const req = client.request(options, (res) => {
    console.log(`Статус: ${res.statusCode} ${res.statusMessage}`);
    console.log(`Заголовки:`, JSON.stringify(res.headers, null, 2));
    console.log('\nОтвет:');

    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            console.log(JSON.stringify(parsed, null, 2));
            
            if (res.statusCode === 200 && parsed.results && parsed.results.length > 0) {
                const result = parsed.results[0];
                if (result.error) {
                    console.log('\n❌ Ошибка в расчете:', result.error);
                } else {
                    console.log('\n✅ Расчет успешен!');
                    console.log(`Портфель: ${result.portfolio?.name || 'N/A'}`);
                    console.log(`Рекомендуемое пополнение: ${result.financials?.recommended_replenishment || 'N/A'} руб/мес`);
                }
            }
        } catch (e) {
            console.log(data);
            console.error('\nОшибка парсинга JSON:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Ошибка запроса: ${e.message}`);
    console.error('\nПроверьте:');
    console.error('1. Правильность URL Railway');
    console.error('2. Что сервер запущен и доступен');
    console.error('3. Что миграции выполнены (npm run migrate)');
    console.error('4. Что seeds выполнены (npm run seed)');
});

req.write(postData);
req.end();












