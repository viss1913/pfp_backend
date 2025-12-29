const http = require('http');
const https = require('https');

/**
 * Тестовый расчет для цели OTHER
 * Стоимость: 7 500 000 руб
 * Срок: 15 лет (180 месяцев)
 * Первоначальный капитал: 300 000 руб
 * Доход клиента: 130 000 руб/мес
 */

// Можно указать URL сервера как аргумент, иначе используем локальный
const serverUrl = process.argv[2] || 'http://localhost:3000';

// Запрос для расчета
const testRequest = {
    goals: [
        {
            goal_type_id: 4,  // OTHER (Прочее)
            name: "Дом",
            target_amount: 7500000,  // 7.5 млн рублей
            term_months: 180,         // 15 лет (180 месяцев)
            risk_profile: "BALANCED",
            initial_capital: 300000,  // 300 тыс рублей
            avg_monthly_income: 130000  // 130 тыс руб/мес (для расчета софинансирования ПДС)
        }
    ]
};

const postData = JSON.stringify(testRequest);

// Определяем протокол
const isHttps = serverUrl.startsWith('https');
const client = isHttps ? https : http;

// Парсим URL
const url = new URL(serverUrl);
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
console.log('РАСЧЕТ ЦЕЛИ: ДОМ (OTHER)');
console.log('='.repeat(80));
console.log('');
console.log('Параметры:');
console.log('  • Стоимость: 7,500,000 руб.');
console.log('  • Срок: 15 лет (180 месяцев)');
console.log('  • Первоначальный капитал: 300,000 руб.');
console.log('  • Доход клиента: 130,000 руб/мес');
console.log('');
console.log('─'.repeat(80));
console.log('ОТПРАВКА ЗАПРОСА');
console.log('─'.repeat(80));
console.log('');
console.log('Server URL:', serverUrl);
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
                        console.log('Цель:', result.goal_name || 'Дом');
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
                            if (fin.recommended_replenishment) {
                                const monthlyReplenishment = fin.recommended_replenishment;
                                const totalReplenishment = monthlyReplenishment * 180; // за 15 лет
                                const totalWithInitial = fin.initial_capital + totalReplenishment;
                                
                                console.log('📈 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:');
                                console.log('');
                                console.log('  Общая сумма пополнений за 15 лет:', totalReplenishment.toLocaleString('ru-RU'), 'руб.');
                                console.log('  С учетом начального капитала:', totalWithInitial.toLocaleString('ru-RU'), 'руб.');
                                console.log('  Процент от дохода:', ((monthlyReplenishment / 130000) * 100).toFixed(1) + '%');
                                console.log('');
                            }
                        }
                        
                        // Информация о софинансировании ПДС
                        if (result.pds_cofinancing) {
                            const pds = result.pds_cofinancing;
                            console.log('💰 СОФИНАНСИРОВАНИЕ ПДС:');
                            console.log('');
                            console.log('  Софинансирование в первый год:', pds.cofinancing_next_year?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Общее софинансирование (номинал):', pds.total_cofinancing_nominal?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Общее софинансирование (с инвестициями):', pds.total_cofinancing_with_investment?.toLocaleString('ru-RU'), 'руб.');
                            console.log('  Доходность ПДС:', pds.pds_yield_annual_percent || 'N/A', '% годовых');
                            console.log('  Новый капитальный разрыв:', pds.new_capital_gap?.toLocaleString('ru-RU'), 'руб.');
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
    console.error('');
    console.error('Убедитесь, что сервер запущен на', serverUrl);
    process.exit(1);
});

req.write(postData);
req.end();
















