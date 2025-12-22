const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'pfpbackend-production.up.railway.app';

// Читаем JSON файл
const jsonPath = path.join(__dirname, 'test_full_client.json');
const testData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const postData = JSON.stringify(testData);

const options = {
    hostname: BASE_URL,
    port: 443,
    path: '/api/client',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('='.repeat(80));
console.log('СОЗДАНИЕ ПОЛНОГО ПРОФИЛЯ КЛИЕНТА');
console.log('='.repeat(80));
console.log('');
console.log('URL: https://' + BASE_URL + options.path);
console.log('');

const clientData = testData.client;

console.log('─'.repeat(80));
console.log('ДАННЫЕ КЛИЕНТА');
console.log('─'.repeat(80));
console.log('  • ФИО:', `${clientData.first_name} ${clientData.middle_name || ''} ${clientData.last_name}`.trim());
console.log('  • Дата рождения:', clientData.birth_date);
console.log('  • Пол:', clientData.gender);
console.log('  • Телефон:', clientData.phone);
console.log('  • Email:', clientData.email);
console.log('  • Среднемесячный доход:', clientData.avg_monthly_income?.toLocaleString('ru-RU'), 'руб/мес');
console.log('');

console.log('─'.repeat(80));
console.log('АКТИВЫ (' + testData.assets.length + ')');
console.log('─'.repeat(80));
testData.assets.forEach((asset, index) => {
    console.log(`  ${index + 1}. ${asset.name} (${asset.type})`);
    console.log(`     Стоимость: ${asset.current_value.toLocaleString('ru-RU')} ${asset.currency || 'RUB'}`);
    if (asset.yield_percent) {
        console.log(`     Доходность: ${asset.yield_percent}%`);
    }
});
const totalAssets = testData.assets.reduce((sum, a) => sum + a.current_value, 0);
console.log(`  Итого активов: ${totalAssets.toLocaleString('ru-RU')} RUB`);
console.log('');

console.log('─'.repeat(80));
console.log('ПАССИВЫ (' + testData.liabilities.length + ')');
console.log('─'.repeat(80));
testData.liabilities.forEach((liability, index) => {
    console.log(`  ${index + 1}. ${liability.name} (${liability.type})`);
    console.log(`     Остаток долга: ${liability.remaining_amount.toLocaleString('ru-RU')} RUB`);
    console.log(`     Ежемесячный платеж: ${liability.monthly_payment.toLocaleString('ru-RU')} RUB`);
    if (liability.interest_rate) {
        console.log(`     Процентная ставка: ${liability.interest_rate}%`);
    }
});
const totalLiabilities = testData.liabilities.reduce((sum, l) => sum + l.remaining_amount, 0);
console.log(`  Итого пассивов: ${totalLiabilities.toLocaleString('ru-RU')} RUB`);
console.log('');

console.log('─'.repeat(80));
console.log('РАСХОДЫ (' + testData.expenses.length + ')');
console.log('─'.repeat(80));
testData.expenses.forEach((expense, index) => {
    console.log(`  ${index + 1}. ${expense.name} (${expense.category})`);
    console.log(`     Сумма: ${expense.amount.toLocaleString('ru-RU')} ${expense.currency || 'RUB'}/мес`);
});
const totalExpenses = testData.expenses.reduce((sum, e) => sum + e.amount, 0);
console.log(`  Итого расходов: ${totalExpenses.toLocaleString('ru-RU')} RUB/мес`);
console.log('');

console.log('─'.repeat(80));
console.log('ЦЕЛИ (' + testData.goals.length + ')');
console.log('─'.repeat(80));
testData.goals.forEach((goal, index) => {
    console.log(`  ${index + 1}. ${goal.name} (ID: ${goal.goal_type_id})`);
    if (goal.goal_type_id === 1) {
        console.log(`     Целевая пенсия: ${goal.target_amount.toLocaleString('ru-RU')} руб/мес`);
    } else {
        console.log(`     Целевая сумма: ${goal.target_amount.toLocaleString('ru-RU')} руб.`);
    }
    console.log(`     Срок: ${goal.term_months} месяцев`);
    console.log(`     Начальный капитал: ${goal.initial_capital.toLocaleString('ru-RU')} руб.`);
});
console.log('');

console.log('─'.repeat(80));
console.log('ДАННЫЕ ЗАПРОСА');
console.log('─'.repeat(80));
console.log(JSON.stringify(testData, null, 2));
console.log('');

console.log('─'.repeat(80));
console.log('ОТПРАВКА ЗАПРОСА...');
console.log('─'.repeat(80));
console.log('');

const startTime = Date.now();

const req = https.request(options, (res) => {
    const responseTime = Date.now() - startTime;
    console.log(`Статус: ${res.statusCode} ${res.statusMessage}`);
    console.log(`Время ответа: ${responseTime}ms`);
    console.log('');

    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        console.log('─'.repeat(80));
        console.log('ОТВЕТ ОТ СЕРВЕРА');
        console.log('─'.repeat(80));
        console.log('');

        try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode === 201) {
                console.log('='.repeat(80));
                console.log('✅ ПРОФИЛЬ КЛИЕНТА СОЗДАН УСПЕШНО!');
                console.log('='.repeat(80));
                console.log('');

                if (parsed.client) {
                    const client = parsed.client;
                    console.log('─'.repeat(80));
                    console.log('СОЗДАННЫЙ ПРОФИЛЬ');
                    console.log('─'.repeat(80));
                    console.log('');
                    console.log('ID клиента:', client.id);
                    console.log('ФИО:', `${client.first_name} ${client.middle_name || ''} ${client.last_name}`.trim());
                    console.log('Дата рождения:', client.birth_date);
                    console.log('Пол:', client.gender);
                    if (client.assets_total !== undefined) {
                        console.log('Итого активов:', client.assets_total.toLocaleString('ru-RU'), 'RUB');
                    }
                    if (client.liabilities_total !== undefined) {
                        console.log('Итого пассивов:', client.liabilities_total.toLocaleString('ru-RU'), 'RUB');
                    }
                    if (client.net_worth !== undefined) {
                        console.log('Чистая стоимость (Net Worth):', client.net_worth.toLocaleString('ru-RU'), 'RUB');
                    }
                    console.log('');
                }

                console.log('─'.repeat(80));
                console.log('ПОЛНЫЙ JSON ОТВЕТ');
                console.log('─'.repeat(80));
                console.log(JSON.stringify(parsed, null, 2));
            } else {
                console.log('='.repeat(80));
                console.log('❌ ОШИБКА');
                console.log('='.repeat(80));
                if (parsed.error) {
                    console.log('Ошибка:', parsed.error);
                }
                if (parsed.details) {
                    console.log('Детали:', JSON.stringify(parsed.details, null, 2));
                }
                console.log('Полный ответ:', JSON.stringify(parsed, null, 2));
            }
        } catch (e) {
            console.error('❌ Ошибка парсинга JSON:', e.message);
            console.log('Сырой ответ (первые 2000 символов):');
            console.log(responseData.substring(0, 2000));
        }

        console.log('');
        console.log('='.repeat(80));
        console.log('Тест завершен');
        console.log('='.repeat(80));
    });
});

req.on('error', (e) => {
    console.error('='.repeat(80));
    console.error('❌ ОШИБКА ПОДКЛЮЧЕНИЯ');
    console.error('='.repeat(80));
    console.error('');
    console.error('Ошибка:', e.message);
    console.error('Код ошибки:', e.code);
    process.exit(1);
});

req.write(postData);
req.end();

