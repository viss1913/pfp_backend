const http = require('http');
const https = require('https');
const fs = require('fs');

/**
 * Тестовый скрипт для расчета пенсии (goal_type_id: 1)
 * Использование: node test_pension_goal1.js [railway-url]
 */

const railwayUrl = process.argv[2] || 'https://pfpbackend-production.up.railway.app';

// Читаем тестовые данные из JSON файла
let testRequest;
try {
    const fileContent = fs.readFileSync('test_pension_goal1.json', 'utf8');
    testRequest = JSON.parse(fileContent);
} catch (e) {
    console.error(`❌ Ошибка чтения файла test_pension_goal1.json:`, e.message);
    process.exit(1);
}

const postData = JSON.stringify(testRequest);

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

console.log('='.repeat(80));
console.log('РАСЧЕТ ЦЕЛИ: ПЕНСИЯ (goal_type_id: 1)');
console.log('='.repeat(80));
console.log('');
console.log('Параметры:');
const goal = testRequest.goals[0];
const clientData = testRequest.client;
console.log('  • Целевая пенсия:', goal.target_amount?.toLocaleString('ru-RU'), 'руб/мес');
console.log('  • Срок:', goal.term_months === 0 ? 'Автоматический (до выхода на пенсию)' : `${goal.term_months} месяцев`);
console.log('  • Первоначальный капитал:', goal.initial_capital?.toLocaleString('ru-RU'), 'руб.');
console.log('  • Риск-профиль:', goal.risk_profile);
console.log('  • Инфляция:', goal.inflation_rate || 'N/A', '% годовых');
console.log('');
console.log('Данные клиента:');
console.log('  • Дата рождения:', clientData.birth_date);
console.log('  • Пол:', clientData.sex);
console.log('  • Среднемесячный доход:', clientData.avg_monthly_income?.toLocaleString('ru-RU'), 'руб/мес');
console.log('  • Текущий ИПК:', clientData.ipk_current || 'не указан');
console.log('');
console.log('─'.repeat(80));
console.log('ОТПРАВКА ЗАПРОСА');
console.log('─'.repeat(80));
console.log('');
console.log('Railway URL:', railwayUrl);
console.log('Эндпоинт:', options.path);
console.log('');
console.log('JSON запрос:');
console.log(JSON.stringify(testRequest, null, 2));
console.log('');
console.log('Ожидание ответа от сервера...\n');

const startTime = Date.now();

const req = client.request(options, (res) => {
    const responseTime = Date.now() - startTime;
    console.log(`Статус ответа: ${res.statusCode} ${res.statusMessage}`);
    console.log(`Время ответа: ${responseTime}ms`);
    console.log('');

    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode === 200) {
                console.log('='.repeat(80));
                console.log('✅ РАСЧЕТ УСПЕШЕН!');
                console.log('='.repeat(80));
                console.log('');
                
                if (parsed.results && parsed.results.length > 0) {
                    const result = parsed.results[0];
                    
                    if (result.error) {
                        console.log('❌ Ошибка:', result.error);
                    } else {
                        console.log('─'.repeat(80));
                        console.log('РЕЗУЛЬТАТЫ РАСЧЕТА');
                        console.log('─'.repeat(80));
                        console.log('');
                        console.log('Цель:', result.goal_name || 'Пенсия');
                        console.log('Портфель:', result.portfolio?.name || 'N/A');
                        console.log('');
                        
                        if (result.financials) {
                            const fin = result.financials;
                            console.log('📊 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ:');
                            console.log('');
                            console.log('  Желаемая пенсия:', fin.desired_pension_monthly?.toLocaleString('ru-RU'), 'руб/мес');
                            console.log('  Прогнозируемая гос. пенсия:', fin.projected_state_pension_monthly?.toLocaleString('ru-RU'), 'руб/мес');
                            console.log('  Недостающая пенсия:', fin.pension_gap_monthly?.toLocaleString('ru-RU'), 'руб/мес');
                            console.log('  Требуемый капитал:', fin.required_capital?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Первоначальный капитал:', fin.initial_capital?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Капитальный разрыв:', fin.capital_gap?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Рекомендуемое пополнение:', fin.recommended_replenishment?.toLocaleString('ru-RU'), 'руб/мес');
                            console.log('  Доходность портфеля:', fin.portfolio_yield_annual_percent || 'N/A', '% годовых');
                            console.log('  Инфляция:', fin.inflation_annual_percent || 'N/A', '% годовых');
                            console.log('');
                        }
                        
                        if (result.pension_details) {
                            const pd = result.pension_details;
                            console.log('📋 ДЕТАЛИ РАСЧЕТА ПЕНСИИ:');
                            console.log('');
                            console.log('  Возраст клиента:', pd.current_age || 'N/A', 'лет');
                            console.log('  Лет до пенсии:', pd.years_to_retirement || 'N/A');
                            console.log('  Прогнозируемый ИПК:', pd.projected_ipk?.toLocaleString('ru-RU') || 'N/A');
                            console.log('  Прогнозируемая фиксированная выплата:', pd.projected_fixed_payment?.toLocaleString('ru-RU') || 'N/A', 'руб/мес');
                            console.log('');
                        }
                        
                        if (result.products && result.products.length > 0) {
                            console.log('📦 ПРОДУКТЫ В ПОРТФЕЛЕ:');
                            console.log('');
                            result.products.forEach((product, index) => {
                                console.log(`  ${index + 1}. ${product.name}`);
                                console.log(`     Доля: ${product.share_percent}%`);
                                console.log(`     Доходность: ${product.yield_percent}% годовых`);
                                console.log('');
                            });
                        }
                        
                        console.log('─'.repeat(80));
                        console.log('ПОЛНЫЙ JSON ОТВЕТ');
                        console.log('─'.repeat(80));
                        console.log(JSON.stringify(parsed, null, 2));
                    }
                } else {
                    console.log('⚠️  Нет результатов в ответе');
                    console.log('Полный ответ:', JSON.stringify(parsed, null, 2));
                }
            } else {
                console.log('='.repeat(80));
                console.log('❌ ОШИБКА');
                console.log('='.repeat(80));
                console.log('');
                console.log('Полный ответ:', JSON.stringify(parsed, null, 2));
            }
        } catch (e) {
            console.error('❌ Ошибка парсинга JSON:', e.message);
            console.log('Сырой ответ (первые 1000 символов):');
            console.log(responseData.substring(0, 1000));
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

