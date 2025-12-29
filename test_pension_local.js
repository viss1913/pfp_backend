/**
 * Тестовый скрипт для проверки расчета пенсии
 * Использование: node test_pension_local.js [url]
 * Пример: node test_pension_local.js http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');

const baseUrl = process.argv[2] || 'http://localhost:3000';
const testDataFile = process.argv[3] || 'test_pension_45_male.json';

// Читаем тестовые данные из файла
let testData;
try {
    const fileContent = fs.readFileSync(testDataFile, 'utf8');
    testData = JSON.parse(fileContent);
} catch (e) {
    console.error(`❌ Ошибка чтения файла ${testDataFile}:`, e.message);
    process.exit(1);
}

const postData = JSON.stringify(testData);

// Определяем протокол
const isHttps = baseUrl.startsWith('https');
const client = isHttps ? https : http;

// Парсим URL
const url = new URL(baseUrl);
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
console.log('Тестирование расчета ПЕНСИИ');
console.log('='.repeat(60));
console.log(`URL: ${baseUrl}`);
console.log(`Эндпоинт: ${options.path}`);
console.log(`Файл данных: ${testDataFile}`);
console.log('\nДанные клиента:');
console.log(`  Дата рождения: ${testData.client.birth_date}`);
console.log(`  Пол: ${testData.client.sex}`);
console.log(`  Возраст: ~${new Date().getFullYear() - new Date(testData.client.birth_date).getFullYear()} лет`);
console.log(`  Среднемесячный доход: ${testData.client.avg_monthly_income || 'не указан'} руб`);
console.log(`  ИПК текущий: ${testData.client.ipk_current !== null ? testData.client.ipk_current : 'не указан (будет оценен)'}`);
console.log('\nЦель:');
console.log(`  Название: ${testData.goals[0].name}`);
console.log(`  Желаемая пенсия: ${testData.goals[0].target_amount} руб/мес`);
console.log(`  Срок: ${testData.goals[0].term_months || 'автоматически (до выхода на пенсию)'} месяцев`);
console.log(`  Начальный капитал: ${testData.goals[0].initial_capital || 0} руб`);
console.log('\nОтправка запроса...\n');

const req = client.request(options, (res) => {
    console.log(`Статус: ${res.statusCode} ${res.statusMessage}`);
    
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            
            if (res.statusCode === 200 && parsed.results && parsed.results.length > 0) {
                const result = parsed.results[0];
                
                if (result.error) {
                    console.log('❌ Ошибка в расчете:', result.error);
                    if (result.error_details) {
                        console.log('Детали:', JSON.stringify(result.error_details, null, 2));
                    }
                } else if (result.goal_type === 'PENSION') {
                    console.log('✅ Расчет пенсии успешен!\n');
                    
                    // Выводим информацию о госпенсии
                    if (result.state_pension) {
                        console.log('📊 ГОСУДАРСТВЕННАЯ ПЕНСИЯ:');
                        console.log(`  ИПК (оценка): ${result.state_pension.ipk_est}`);
                        console.log(`  Госпенсия (в ценах будущего): ${result.state_pension.state_pension_monthly_future.toLocaleString('ru-RU')} руб/мес`);
                        console.log(`  Госпенсия (в ценах сегодня): ${result.state_pension.state_pension_monthly_current.toLocaleString('ru-RU')} руб/мес`);
                        console.log(`  Пенсионный возраст: ${result.state_pension.retirement_age} лет`);
                        console.log(`  Год выхода на пенсию: ${result.state_pension.retirement_year}`);
                        console.log(`  Лет до пенсии: ${result.state_pension.years_to_pension}`);
                        console.log(`  Лет стажа: ${result.state_pension.years_of_work}`);
                        console.log(`  Текущий возраст: ${result.state_pension.age} лет`);
                    }
                    
                    // Выводим информацию о желаемой пенсии
                    if (result.desired_pension) {
                        console.log('\n💰 ЖЕЛАЕМАЯ ПЕНСИЯ:');
                        console.log(`  Начальная: ${result.desired_pension.desired_monthly_income_initial.toLocaleString('ru-RU')} руб/мес`);
                        console.log(`  С учетом инфляции: ${result.desired_pension.desired_monthly_income_with_inflation.toLocaleString('ru-RU')} руб/мес`);
                    }
                    
                    // Выводим информацию о дефиците
                    if (result.pension_gap) {
                        console.log('\n📉 ДЕФИЦИТ ПЕНСИИ:');
                        if (result.pension_gap.has_gap) {
                            console.log(`  Дефицит (в ценах будущего): ${result.pension_gap.gap_monthly_future.toLocaleString('ru-RU')} руб/мес`);
                            console.log(`  Дефицит (в ценах сегодня): ${result.pension_gap.gap_monthly_current.toLocaleString('ru-RU')} руб/мес`);
                        } else {
                            console.log(`  ✅ Дефицита нет! Госпенсия покрывает желаемую пенсию.`);
                        }
                    }
                    
                    // Выводим информацию о расчете капитала (если есть дефицит)
                    if (result.passive_income_calculation) {
                        console.log('\n💼 РАСЧЕТ КАПИТАЛА ДЛЯ ПОКРЫТИЯ ДЕФИЦИТА:');
                        console.log(`  Необходимый капитал: ${result.passive_income_calculation.required_capital.toLocaleString('ru-RU')} руб`);
                        console.log(`  Доходность портфеля: ${result.passive_income_calculation.yield_percent}% годовых`);
                    }
                    
                    // Выводим финансовые показатели
                    if (result.financials) {
                        console.log('\n💵 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ:');
                        console.log(`  Начальный капитал: ${result.financials.initial_capital.toLocaleString('ru-RU')} руб`);
                        console.log(`  Дефицит капитала: ${result.financials.capital_gap.toLocaleString('ru-RU')} руб`);
                        console.log(`  Рекомендуемое пополнение: ${result.financials.recommended_replenishment.toLocaleString('ru-RU')} руб/мес`);
                        console.log(`  Инфляция: ${result.financials.inflation_annual_percent}% годовых`);
                        console.log(`  Доходность портфеля: ${result.financials.portfolio_yield_annual_percent}% годовых`);
                    }
                    
                    // Выводим информацию о ПДС софинансировании (если есть)
                    if (result.pds_cofinancing && result.pds_cofinancing.cofinancing_next_year) {
                        console.log('\n🎁 СОФИНАНСИРОВАНИЕ ПДС:');
                        console.log(`  Софинансирование в следующем году: ${result.pds_cofinancing.cofinancing_next_year.toLocaleString('ru-RU')} руб`);
                        console.log(`  Общее софинансирование (номинал): ${result.pds_cofinancing.total_cofinancing_nominal.toLocaleString('ru-RU')} руб`);
                        console.log(`  Общее софинансирование (с инвестированием): ${result.pds_cofinancing.total_cofinancing_with_investment.toLocaleString('ru-RU')} руб`);
                    }
                    
                    // Полный ответ для отладки
                    console.log('\n' + '='.repeat(60));
                    console.log('ПОЛНЫЙ ОТВЕТ (JSON):');
                    console.log('='.repeat(60));
                    console.log(JSON.stringify(parsed, null, 2));
                } else {
                    console.log('⚠️ Неожиданный тип цели:', result.goal_type);
                    console.log(JSON.stringify(parsed, null, 2));
                }
            } else {
                console.log('⚠️ Неожиданный формат ответа');
                console.log(JSON.stringify(parsed, null, 2));
            }
        } catch (e) {
            console.log('Ответ сервера (не JSON):');
            console.log(data);
            console.error('\n❌ Ошибка парсинга JSON:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Ошибка запроса: ${e.message}`);
    console.error('\nПроверьте:');
    console.error('1. Что сервер запущен (npm start или node src/server.js)');
    console.error('2. Что миграции выполнены (npm run migrate)');
    console.error('3. Что seeds выполнены (npm run seed)');
    console.error('4. Правильность URL (по умолчанию http://localhost:3000)');
});

req.write(postData);
req.end();















