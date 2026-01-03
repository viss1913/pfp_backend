const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'pfpbackend-production.up.railway.app';

// Читаем JSON файл
const jsonPath = path.join(__dirname, 'test_pension_30_110k.json');
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
console.log('ТЕСТ РАСЧЕТА: ПЕНСИЯ (30 лет, 110k доход, 100k цель)');
console.log('='.repeat(80));
console.log('');
console.log('URL: https://' + BASE_URL + options.path);
console.log('');

const goal = testData.goals[0];
const clientData = testData.client;

console.log('─'.repeat(80));
console.log('ПАРАМЕТРЫ ЦЕЛИ');
console.log('─'.repeat(80));
console.log('  • Целевая пенсия:', goal.target_amount?.toLocaleString('ru-RU'), 'руб/мес');
console.log('  • Срок:', goal.term_months === 0 ? 'Автоматический (до выхода на пенсию)' : `${goal.term_months} месяцев`);
console.log('  • Первоначальный капитал:', goal.initial_capital?.toLocaleString('ru-RU'), 'руб.');
console.log('  • Риск-профиль:', goal.risk_profile);
console.log('  • Инфляция:', goal.inflation_rate || 'N/A', '% годовых');
console.log('');

console.log('─'.repeat(80));
console.log('ДАННЫЕ КЛИЕНТА');
console.log('─'.repeat(80));
console.log('  • Дата рождения:', clientData.birth_date);
console.log('  • Пол:', clientData.sex);
console.log('  • Среднемесячный доход:', clientData.avg_monthly_income?.toLocaleString('ru-RU'), 'руб/мес');
console.log('  • Текущий ИПК:', clientData.ipk_current || 'не указан');
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
            
            if (res.statusCode === 200) {
                console.log('='.repeat(80));
                console.log('✅ ЗАПРОС УСПЕШЕН!');
                console.log('='.repeat(80));
                console.log('');

                if (parsed.goals && parsed.goals.length > 0) {
                    const result = parsed.goals[0];
                    
                    if (result.error) {
                        console.log('❌ Ошибка:', result.error);
                        if (result.error_details) {
                            console.log('Детали ошибки:', JSON.stringify(result.error_details, null, 2));
                        }
                    } else {
                        console.log('─'.repeat(80));
                        console.log('РЕЗУЛЬТАТЫ РАСЧЕТА');
                        console.log('─'.repeat(80));
                        console.log('');
                        console.log('Цель:', result.goal_name || 'Пенсия');
                        console.log('Тип цели:', result.goal_type || 'PENSION');
                        console.log('');

                        if (result.state_pension) {
                            const sp = result.state_pension;
                            console.log('🏛️  ГОСУДАРСТВЕННАЯ ПЕНСИЯ:');
                            console.log('');
                            if (sp.age !== undefined) console.log('  Возраст:', sp.age, 'лет');
                            if (sp.years_to_pension !== undefined) console.log('  Лет до пенсии:', sp.years_to_pension);
                            if (sp.retirement_age !== undefined) console.log('  Пенсионный возраст:', sp.retirement_age, 'лет');
                            if (sp.retirement_year !== undefined) console.log('  Год выхода на пенсию:', sp.retirement_year);
                            if (sp.ipk_est !== undefined) console.log('  Прогнозируемый ИПК:', sp.ipk_est.toFixed(2));
                            if (sp.state_pension_monthly_current !== undefined) {
                                console.log('  Гос. пенсия (текущие цены):', sp.state_pension_monthly_current.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            if (sp.state_pension_monthly_future !== undefined) {
                                console.log('  Гос. пенсия (будущие цены):', sp.state_pension_monthly_future.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            console.log('');
                        }

                        if (result.desired_pension) {
                            const dp = result.desired_pension;
                            console.log('💭 ЖЕЛАЕМАЯ ПЕНСИЯ:');
                            console.log('');
                            if (dp.desired_monthly_income_initial !== undefined) {
                                console.log('  Желаемая пенсия (начальная):', dp.desired_monthly_income_initial.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            if (dp.desired_monthly_income_with_inflation !== undefined) {
                                console.log('  Желаемая пенсия (с инфляцией):', dp.desired_monthly_income_with_inflation.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            console.log('');
                        }

                        if (result.pension_gap) {
                            const pg = result.pension_gap;
                            console.log('📊 ДЕФИЦИТ ПЕНСИИ:');
                            console.log('');
                            if (pg.gap_monthly_current !== undefined) {
                                console.log('  Дефицит (текущие цены):', pg.gap_monthly_current.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            if (pg.gap_monthly_future !== undefined) {
                                console.log('  Дефицит (будущие цены):', pg.gap_monthly_future.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            if (pg.has_gap !== undefined) {
                                console.log('  Есть дефицит:', pg.has_gap ? 'Да' : 'Нет');
                            }
                            console.log('');
                        }

                        if (result.financials) {
                            const fin = result.financials;
                            console.log('💰 ФИНАНСОВЫЕ ПОКАЗАТЕЛИ:');
                            console.log('');
                            if (fin.initial_capital !== undefined) {
                                console.log('  Первоначальный капитал:', fin.initial_capital.toLocaleString('ru-RU'), 'руб.');
                            }
                            if (fin.capital_gap !== undefined) {
                                console.log('  Капитальный разрыв:', fin.capital_gap.toLocaleString('ru-RU'), 'руб.');
                            }
                            if (fin.recommended_replenishment !== undefined) {
                                console.log('  Рекомендуемое пополнение:', fin.recommended_replenishment.toLocaleString('ru-RU'), 'руб/мес');
                            }
                            if (fin.portfolio_yield_annual_percent !== undefined) {
                                console.log('  Доходность портфеля:', fin.portfolio_yield_annual_percent, '% годовых');
                            }
                            if (fin.inflation_annual_percent !== undefined) {
                                console.log('  Инфляция:', fin.inflation_annual_percent, '% годовых');
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
                            if (summary.state_benefit !== undefined) {
                                console.log('  Государственная поддержка:', summary.state_benefit.toLocaleString('ru-RU'), 'руб.');
                            }
                            console.log('');
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

