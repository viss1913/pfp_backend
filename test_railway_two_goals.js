const http = require('http');
const https = require('https');

/**
 * Тестовый скрипт для проверки расчета двух целей на Railway
 * Использование: node test_railway_two_goals.js [railway-url]
 * Пример: node test_railway_two_goals.js https://pfp-backend-production.up.railway.app
 */

const railwayUrl = process.argv[2] || 'https://pfp-backend-production.up.railway.app';

// Данные клиента: мужчина, 35 лет (1990-01-01)
const currentYear = new Date().getFullYear();
const birthYear = currentYear - 35;
const birthDate = `${birthYear}-01-01`;

// Запрос с двумя целями
const testRequest = {
    goals: [
        {
            // Цель 1: Дом
            goal_type_id: 4,  // OTHER (Прочее) - для "Дом"
            name: "Дом",
            target_amount: 10000000,  // 10 млн рублей
            term_months: 60,           // 5 лет (60 месяцев)
            risk_profile: "BALANCED",
            initial_capital: 3000000,   // 3 млн рублей
            inflation_rate: 10.0        // 10% инфляция
        },
        {
            // Цель 2: Защита Жизни
            goal_type_id: 5,  // LIFE - для страхования жизни
            name: "Защита Жизни",
            target_amount: 3000000,    // 3 млн рублей (лимит)
            term_months: 180,          // 15 лет (180 месяцев)
            risk_profile: "BALANCED",  // Обязательное поле, но не используется для LIFE
            payment_variant: 0,        // 0 - единовременно
            program: "test"            // Код программы НСЖ
        }
    ],
    client: {
        birth_date: birthDate,  // 1990-01-01 (35 лет)
        sex: "male",            // мужчина
        fio: "Тестовый Клиент",
        phone: "+79991234567",
        email: "test@example.com"
    }
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
console.log('ТЕСТ РАСЧЕТА ДВУХ ЦЕЛЕЙ НА RAILWAY');
console.log('='.repeat(80));
console.log('');
console.log('Railway URL:', railwayUrl);
console.log('Эндпоинт:', options.path);
console.log('');
console.log('─'.repeat(80));
console.log('ДАННЫЕ КЛИЕНТА');
console.log('─'.repeat(80));
console.log('Пол: Мужчина');
console.log('Возраст: 35 лет');
console.log('Дата рождения:', birthDate);
console.log('');
console.log('─'.repeat(80));
console.log('ЦЕЛЬ 1: ДОМ');
console.log('─'.repeat(80));
console.log('Стоимость: 10,000,000 руб.');
console.log('Инфляция: 10%');
console.log('Срок: 5 лет (60 месяцев)');
console.log('Начальный капитал: 3,000,000 руб.');
console.log('');
console.log('─'.repeat(80));
console.log('ЦЕЛЬ 2: ЗАЩИТА ЖИЗНИ');
console.log('─'.repeat(80));
console.log('Лимит: 3,000,000 руб.');
console.log('Срок: 15 лет (180 месяцев)');
console.log('');
console.log('─'.repeat(80));
console.log('ОТПРАВКА ЗАПРОСА');
console.log('─'.repeat(80));
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
    console.log('Заголовки ответа:');
    console.log(JSON.stringify(res.headers, null, 2));
    console.log('');
    console.log('─'.repeat(80));
    console.log('ОТВЕТ ОТ СЕРВЕРА');
    console.log('─'.repeat(80));
    console.log('');

    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
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
                        const goal = testRequest.goals[index];
                        console.log('─'.repeat(80));
                        console.log(`РЕЗУЛЬТАТ ${index + 1}: ${goal.name}`);
                        console.log('─'.repeat(80));
                        
                        if (result.error) {
                            console.log('❌ Ошибка:', result.error);
                        } else {
                            // Для LIFE целей
                            if (goal.goal_type_id === 5 || result.goal_type === 'LIFE') {
                                const nsj = result.nsj_calculation || result;
                                console.log('Тип: Страхование жизни (NSJ)');
                                console.log('✅ Расчет успешен:', nsj.success ? 'Да' : 'Нет');
                                console.log('Срок:', nsj.term_years || nsj.term, 'лет');
                                console.log('Общая премия:', (nsj.total_premium || nsj.total_premium_rur)?.toLocaleString('ru-RU'), 'руб.');
                                console.log('Страховая сумма:', nsj.total_limit?.toLocaleString('ru-RU'), 'руб.');
                                console.log('Гарантированная прибыль:', nsj.garantProfit ? `${nsj.garantProfit}%` : 'N/A');
                                console.log('Количество рисков:', nsj.risks?.length || 0);
                                
                                if (nsj.risks && nsj.risks.length > 0) {
                                    console.log('');
                                    console.log('Детализация рисков:');
                                    nsj.risks.forEach((risk, i) => {
                                        console.log(`  ${i + 1}. ${risk.name || risk.code}`);
                                        console.log(`     Тип: ${risk.type}`);
                                        console.log(`     Тариф: ${risk.tariff}%`);
                                        console.log(`     Премия: ${(risk.premiumRUR || risk.premium)?.toLocaleString('ru-RU')} руб.`);
                                        console.log(`     Страховая сумма: ${(risk.limitRUR || risk.limit)?.toLocaleString('ru-RU')} руб.`);
                                    });
                                }
                                
                                if (nsj.comission) {
                                    console.log('');
                                    console.log('Комиссия:');
                                    console.log(`  Процент: ${nsj.comission.percent}%`);
                                    console.log(`  Сумма: ${nsj.comission.amount?.toLocaleString('ru-RU')} руб.`);
                                }
                                
                                if (nsj.payments_list && nsj.payments_list.length > 0) {
                                    console.log('');
                                    console.log('График платежей:');
                                    nsj.payments_list.slice(0, 3).forEach((payment, i) => {
                                        const date = new Date(payment.date);
                                        console.log(`  Платеж ${payment.i}: ${date.toLocaleDateString('ru-RU')} - ${payment.premium?.toLocaleString('ru-RU')} руб.`);
                                    });
                                    if (nsj.payments_list.length > 3) {
                                        console.log(`  ... и еще ${nsj.payments_list.length - 3} платежей`);
                                    }
                                }
                            } else {
                                // Для обычных целей
                                console.log('Тип: Портфельный расчет');
                                console.log('Портфель:', result.portfolio?.name || 'N/A');
                                console.log('Рекомендуемое пополнение:', 
                                    result.financials?.recommended_replenishment?.toLocaleString('ru-RU') || 'N/A', 'руб/мес');
                                console.log('Капитальный разрыв:', 
                                    result.financials?.capital_gap?.toLocaleString('ru-RU') || 'N/A', 'руб');
                                console.log('Итоговая сумма:', 
                                    result.financials?.final_amount?.toLocaleString('ru-RU') || 'N/A', 'руб');
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
    console.error('Проверьте:');
    console.error('1. Правильность URL Railway');
    console.error('2. Что сервер запущен и доступен');
    console.error('3. Что миграции выполнены');
    console.error('4. Что seeds выполнены');
    console.error('');
    console.error('Пример правильного URL:');
    console.error('  https://pfp-backend-production.up.railway.app');
    console.error('  или');
    console.error('  https://pfpbackend-production.up.railway.app');
    process.exit(1);
});

req.write(postData);
req.end();

