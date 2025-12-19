const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'pfpbackend-production.up.railway.app';

// Читаем JSON файл
const jsonPath = path.join(__dirname, 'test_passive_income_life.json');
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
console.log('ТЕСТ РАСЧЕТА: ПАССИВНЫЙ ДОХОД + СТРАХОВАНИЕ ЖИЗНИ');
console.log('='.repeat(80));
console.log('');
console.log('URL: https://' + BASE_URL + options.path);
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
            console.log(JSON.stringify(parsed, null, 2));
            console.log('');

            if (res.statusCode === 200) {
                console.log('='.repeat(80));
                console.log('✅ ЗАПРОС УСПЕШЕН!');
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
                            // Для LIFE целей (goal_type_id: 5)
                            if (goal.goal_type_id === 5 || result.goal_type === 'LIFE') {
                                const nsj = result.nsj_calculation || result;
                                console.log('Тип: Страхование жизни (NSJ)');
                                console.log('✅ Расчет успешен:', nsj.success ? 'Да' : 'Нет');
                                if (nsj.term_years) console.log('Срок:', nsj.term_years, 'лет');
                                if (nsj.total_premium || nsj.total_premium_rur) {
                                    console.log('Общая премия:', (nsj.total_premium || nsj.total_premium_rur).toLocaleString('ru-RU'), 'руб.');
                                }
                                if (nsj.total_limit) {
                                    console.log('Страховая сумма:', nsj.total_limit.toLocaleString('ru-RU'), 'руб.');
                                }
                            } 
                            // Для PASSIVE_INCOME целей (goal_type_id: 2)
                            else if (goal.goal_type_id === 2 || result.goal_type === 'PASSIVE_INCOME') {
                                console.log('Тип: Пассивный доход');
                                const calc = result.passive_income_calculation || result;
                                if (calc.desired_monthly_income_initial) {
                                    console.log('Желаемый месячный доход (начальный):', calc.desired_monthly_income_initial.toLocaleString('ru-RU'), 'руб/мес');
                                }
                                if (calc.desired_monthly_income_with_inflation) {
                                    console.log('Желаемый месячный доход (с инфляцией):', calc.desired_monthly_income_with_inflation.toLocaleString('ru-RU'), 'руб/мес');
                                }
                                if (calc.required_capital) {
                                    console.log('Требуемый капитал:', calc.required_capital.toLocaleString('ru-RU'), 'руб');
                                }
                                if (calc.yield_percent) {
                                    console.log('Доходность (%):', calc.yield_percent + '%');
                                }
                                if (result.financials) {
                                    console.log('Рекомендуемое пополнение:', 
                                        result.financials.recommended_replenishment?.toLocaleString('ru-RU') || 'N/A', 'руб/мес');
                                    console.log('Капитальный разрыв:', 
                                        result.financials.capital_gap?.toLocaleString('ru-RU') || 'N/A', 'руб');
                                }
                            } 
                            // Для обычных целей
                            else {
                                console.log('Тип: Портфельный расчет');
                                if (result.portfolio) {
                                    console.log('Портфель:', result.portfolio.name || 'N/A');
                                }
                                if (result.financials) {
                                    console.log('Рекомендуемое пополнение:', 
                                        result.financials.recommended_replenishment?.toLocaleString('ru-RU') || 'N/A', 'руб/мес');
                                    console.log('Капитальный разрыв:', 
                                        result.financials.capital_gap?.toLocaleString('ru-RU') || 'N/A', 'руб');
                                    console.log('Итоговая сумма:', 
                                        result.financials.final_amount?.toLocaleString('ru-RU') || 'N/A', 'руб');
                                }
                            }
                        }
                        console.log('');
                    });
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
