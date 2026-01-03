const http = require('http');

/**
 * Тестовый скрипт для проверки расчета страхования жизни через наш бэкенд
 * Запуск: 
 *   1. Запустите сервер: npm start (или npm run dev)
 *   2. В другом терминале: node test_life_via_backend.js
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_ENDPOINT = `${SERVER_URL}/api/client/calculate`;

// Тестовые данные для расчета страхования жизни
const testRequest = {
    goals: [
        {
            goal_type_id: 5,  // ID для типа "Жизнь" (LIFE)
            name: "Страхование жизни",
            target_amount: 2500000,  // 2.5 млн рублей
            term_months: 240,        // 20 лет (240 месяцев)
            risk_profile: "BALANCED", // Не используется для LIFE, но обязательное поле
            initial_capital: 0,
            payment_variant: 0,      // 0 - единовременно, 12 - ежемесячно
            program: "test"         // Код программы НСЖ
        }
    ],
    client: {
        birth_date: "1989-01-01",  // Дата рождения: 01.01.1989 (36 лет)
        sex: "male",                // Пол: мужской
        fio: "Иванов Иван Иванович",
        phone: "+79991234567",
        email: "test@example.com"
    }
};

console.log('='.repeat(70));
console.log('ТЕСТ РАСЧЕТА СТРАХОВАНИЯ ЖИЗНИ ЧЕРЕЗ НАШ БЭКЕНД');
console.log('='.repeat(70));
console.log('');
console.log('Сервер:', SERVER_URL);
console.log('Эндпоинт:', API_ENDPOINT);
console.log('');
console.log('Запрос:');
console.log(JSON.stringify(testRequest, null, 2));
console.log('');
console.log('Отправка запроса...');
console.log('');

const postData = JSON.stringify(testRequest);

const url = new URL(API_ENDPOINT);
const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    console.log(`Статус ответа: ${res.statusCode} ${res.statusMessage}`);
    console.log('Заголовки ответа:');
    console.log(JSON.stringify(res.headers, null, 2));
    console.log('');
    console.log('Тело ответа:');
    
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
                console.log('='.repeat(70));
                console.log('✅ ЗАПРОС УСПЕШЕН!');
                console.log('='.repeat(70));
                console.log('');
                
                // Проверяем результаты
                if (parsed.results && parsed.results.length > 0) {
                    const lifeResult = parsed.results.find(r => r.goal_type_id === 5 || r.name === 'Страхование жизни');
                    if (lifeResult) {
                        console.log('Результаты расчета страхования жизни:');
                        console.log('- Срок:', lifeResult.term_years || lifeResult.term, 'лет');
                        console.log('- Общая премия:', lifeResult.total_premium || lifeResult.total_premium_rur, 'руб.');
                        console.log('- Страховая сумма:', lifeResult.total_limit, 'руб.');
                        console.log('- Количество рисков:', lifeResult.risks?.length || 0);
                        
                        if (lifeResult.risks && lifeResult.risks.length > 0) {
                            console.log('');
                            console.log('Детали рисков:');
                            lifeResult.risks.forEach((risk, index) => {
                                console.log(`  ${index + 1}. ${risk.name || risk.code}`);
                                console.log(`     Премия: ${risk.premiumRUR || risk.premium} руб.`);
                                console.log(`     Страховая сумма: ${risk.limitRUR || risk.limit} руб.`);
                            });
                        }
                        
                        if (lifeResult.warnings && lifeResult.warnings.length > 0) {
                            console.log('');
                            console.log('⚠️  Предупреждения:');
                            lifeResult.warnings.forEach(warning => {
                                console.log(`  - ${warning}`);
                            });
                        }
                    }
                }
            } else {
                console.log('='.repeat(70));
                console.log('❌ ОШИБКА');
                console.log('='.repeat(70));
                if (parsed.error) {
                    console.log('Ошибка:', parsed.error);
                }
                if (parsed.details) {
                    console.log('Детали:', parsed.details);
                }
            }
        } catch (e) {
            console.error('❌ Ошибка парсинга JSON:', e.message);
            console.log('Сырой ответ:');
            console.log(responseData);
        }
        
        console.log('');
        console.log('='.repeat(70));
        console.log('Тест завершен');
        console.log('='.repeat(70));
    });
});

req.on('error', (e) => {
    console.error('='.repeat(70));
    console.error('❌ ОШИБКА ПОДКЛЮЧЕНИЯ');
    console.error('='.repeat(70));
    console.error('');
    console.error('Ошибка:', e.message);
    console.error('Код ошибки:', e.code);
    console.error('');
    console.error('Убедитесь, что сервер запущен:');
    console.error('  npm start');
    console.error('или');
    console.error('  npm run dev');
    console.error('');
    console.error('Или измените SERVER_URL в скрипте, если сервер на другом адресе');
    process.exit(1);
});

req.write(postData);
req.end();























