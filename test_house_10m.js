const http = require('http');
const https = require('https');

/**
 * Тестовый скрипт для расчета цели "Купить дом"
 * Параметры:
 * - Стоимость: 10 млн рублей
 * - Срок: 5 лет (60 месяцев)
 * - Первоначальный капитал: 500 тыс рублей
 * Использование: node test_house_10m.js [railway-url]
 */

const railwayUrl = process.argv[2] || 'https://pfpbackend-production.up.railway.app';

// Запрос для расчета "Купить дом"
const testRequest = {
    goals: [
        {
            goal_type_id: 4,  // OTHER (Прочее) - для "Купить дом"
            name: "Купить дом",
            target_amount: 10000000,  // 10 млн рублей
            term_months: 60,          // 5 лет (60 месяцев)
            risk_profile: "BALANCED",
            initial_capital: 500000    // 500 тыс рублей
        }
    ]
};

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
console.log('РАСЧЕТ ЦЕЛИ: КУПИТЬ ДОМ');
console.log('='.repeat(80));
console.log('');
console.log('Параметры:');
console.log('  • Стоимость: 10,000,000 руб.');
console.log('  • Срок: 5 лет (60 месяцев)');
console.log('  • Первоначальный капитал: 500,000 руб.');
console.log('  • Тип цели: OTHER (id=4)');
console.log('  • Риск-профиль: BALANCED');
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
                        console.log('Цель:', result.goal_name || 'Купить дом');
                        console.log('Портфель:', result.portfolio?.name || 'N/A');
                        console.log('');
                        
                        if (result.financials) {
                            const fin = result.financials;
                            console.log('📊 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ:');
                            console.log('');
                            console.log('  Начальная стоимость:', fin.cost_initial?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Стоимость с учетом инфляции:', fin.cost_with_inflation?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Инфляция:', fin.inflation_annual_percent || 'N/A', '% годовых');
                            console.log('  Первоначальный капитал:', fin.initial_capital?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Капитальный разрыв:', fin.capital_gap?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Рекомендуемое пополнение:', fin.recommended_replenishment?.toLocaleString('ru-RU'), 'руб/мес');
                            console.log('  Доходность портфеля:', fin.portfolio_yield_annual_percent || 'N/A', '% годовых');
                            console.log('');
                            
                            // Дополнительные расчеты
                            if (fin.recommended_replenishment && fin.capital_gap) {
                                const monthlyReplenishment = fin.recommended_replenishment;
                                const totalReplenishment = monthlyReplenishment * 60; // за 5 лет
                                const totalWithInitial = fin.initial_capital + totalReplenishment;
                                console.log('📈 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:');
                                console.log('');
                                console.log('  Общая сумма пополнений за 5 лет:', totalReplenishment.toLocaleString('ru-RU'), 'руб.');
                                console.log('  С учетом начального капитала:', totalWithInitial.toLocaleString('ru-RU'), 'руб.');
                                console.log('  Целевая сумма (с инфляцией):', fin.cost_with_inflation?.toLocaleString('ru-RU'), 'руб.');
                                if (fin.cost_with_inflation) {
                                    const difference = fin.cost_with_inflation - totalWithInitial;
                                    console.log('  Разница:', difference.toLocaleString('ru-RU'), 'руб.');
                                }
                                console.log('');
                            }
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
