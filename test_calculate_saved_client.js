const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'pfpbackend-production.up.railway.app';

// Читаем JSON файл
const jsonPath = path.join(__dirname, 'test_calculate_saved_client.json');
const testData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const postData = JSON.stringify(testData);

const options = {
    hostname: BASE_URL,
    port: 443,
    path: '/api/client/calculate',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('='.repeat(80));
console.log('РАСЧЕТ ФИНАНСОВОГО ПЛАНА ДЛЯ СОХРАНЕННОГО КЛИЕНТА');
console.log('='.repeat(80));
console.log('');
console.log('URL: https://' + BASE_URL + options.path);
console.log('');

const clientData = testData.client;

console.log('─'.repeat(80));
console.log('ДАННЫЕ КЛИЕНТА');
console.log('─'.repeat(80));
console.log('  • Дата рождения:', clientData.birth_date);
console.log('  • Пол:', clientData.sex);
console.log('  • Среднемесячный доход:', clientData.avg_monthly_income?.toLocaleString('ru-RU'), 'руб/мес');
console.log('');

testData.goals.forEach((goal, index) => {
    console.log('─'.repeat(80));
    console.log(`ЦЕЛЬ ${index + 1}: ${goal.name} (ID: ${goal.goal_type_id})`);
    console.log('─'.repeat(80));
    if (goal.goal_type_id === 1) {
        console.log('  • Целевая пенсия:', goal.target_amount?.toLocaleString('ru-RU'), 'руб/мес');
    } else {
        console.log('  • Стоимость:', goal.target_amount?.toLocaleString('ru-RU'), 'руб.');
    }
    console.log('  • Срок:', `${goal.term_months} месяцев (${goal.term_months / 12} лет)`);
    console.log('  • Первоначальный капитал:', goal.initial_capital?.toLocaleString('ru-RU'), 'руб.');
    console.log('  • Риск-профиль:', goal.risk_profile);
    console.log('  • Инфляция:', goal.inflation_rate || 'N/A', '% годовых');
    console.log('');
});

console.log('─'.repeat(80));
console.log('ДАННЫЕ ЗАПРОСА');
console.log('─'.repeat(80));
console.log(JSON.stringify(testData, null, 2));
console.log('');

console.log('─'.repeat(80));
console.log('ОТПРАВКА ЗАПРОСА НА РАСЧЕТ...');
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
            
            if (res.statusCode === 200) {
                console.log('='.repeat(80));
                console.log('✅ РАСЧЕТ ВЫПОЛНЕН УСПЕШНО!');
                console.log('='.repeat(80));
                console.log('');

                if (parsed.results && parsed.results.length > 0) {
                    parsed.results.forEach((result, index) => {
                        const goal = testData.goals[index];
                        console.log('─'.repeat(80));
                        console.log(`РЕЗУЛЬТАТ ${index + 1}: ${goal.name} (ID: ${goal.goal_type_id})`);
                        console.log('─'.repeat(80));
                        
                        if (result.error) {
                            console.log('❌ Ошибка:', result.error);
                        } else {
                            console.log('Тип цели:', result.goal_type || 'N/A');
                            if (result.portfolio) {
                                console.log('Портфель:', result.portfolio.name || 'N/A');
                            }
                            console.log('');

                            if (result.financials) {
                                const fin = result.financials;
                                console.log('📊 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ:');
                                console.log('');
                                if (fin.recommended_replenishment !== undefined) {
                                    console.log('  Рекомендуемое пополнение:', fin.recommended_replenishment.toLocaleString('ru-RU'), 'руб/мес');
                                }
                                if (fin.capital_gap !== undefined) {
                                    console.log('  Капитальный разрыв:', fin.capital_gap.toLocaleString('ru-RU'), 'руб.');
                                }
                                if (fin.portfolio_yield_annual_percent !== undefined) {
                                    console.log('  Доходность портфеля:', fin.portfolio_yield_annual_percent, '% годовых');
                                }
                                console.log('');
                            }

                            if (result.summary) {
                                const summary = result.summary;
                                console.log('📋 СВОДКА:');
                                console.log('');
                                if (summary.status) console.log('  Статус:', summary.status);
                                if (summary.monthly_replenishment !== undefined) {
                                    console.log('  Ежемесячное пополнение:', summary.monthly_replenishment.toLocaleString('ru-RU'), 'руб/мес');
                                }
                                if (summary.total_capital_at_end !== undefined) {
                                    console.log('  Итоговый капитал:', summary.total_capital_at_end.toLocaleString('ru-RU'), 'руб.');
                                }
                                if (summary.target_achieved !== undefined) {
                                    console.log('  Цель достигнута:', summary.target_achieved ? 'Да' : 'Нет');
                                }
                                if (summary.state_benefit !== undefined) {
                                    console.log('  Государственная поддержка:', summary.state_benefit.toLocaleString('ru-RU'), 'руб.');
                                }
                                console.log('');
                            }
                        }
                    });

                    if (parsed.summary) {
                        console.log('─'.repeat(80));
                        console.log('ОБЩАЯ СВОДКА');
                        console.log('─'.repeat(80));
                        console.log('');
                        if (parsed.summary.goals_count) {
                            console.log('  Количество целей:', parsed.summary.goals_count);
                        }
                        if (parsed.summary.total_capital) {
                            console.log('  Общий капитал:', parsed.summary.total_capital.toLocaleString('ru-RU'), 'руб.');
                        }
                        if (parsed.summary.total_state_benefit) {
                            console.log('  Общая гос. поддержка:', parsed.summary.total_state_benefit.toLocaleString('ru-RU'), 'руб.');
                        }
                        console.log('');
                    }

                    console.log('─'.repeat(80));
                    console.log('ПОЛНЫЙ JSON ОТВЕТ');
                    console.log('─'.repeat(80));
                    console.log(JSON.stringify(parsed, null, 2));
                } else {
                    console.log('⚠️  Нет результатов в ответе');
                    console.log('Полный ответ:', JSON.stringify(parsed, null, 2));
                }
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



