const axios = require('axios');

// API endpoint
const API_URL = 'https://demo.avinfors.ru/api-life/api/flow/';
const API_KEY = 'ede88df2c022e810fedc09d4';

// Получить текущую дату в нужном формате
const getCurrentDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}.${month}.${year} 00:00:00`;
};

// Запрос на расчет НСЖ
async function calculateLifeInsurance() {
    console.log('\n=== ТЕСТ API РАСЧЕТА НСЖ ===\n');

    const requestData = {
        operation: 'Contract.LifeEndowment.calculate',
        data: {
            beginDate: getCurrentDate(),
            insConditions: {
                program: 'test',          // код продукта (Тестовая программа)
                currency: 'RUR',          // рубли
                paymentVariant: 1,        // ежегодно
                term: 15                  // 15 лет
            },
            policyHolder: {
                age: 45,                  // 45 лет
                sex: 'male'               // мужчина (обязательное поле!)
            },
            insuredPerson: {
                isPolicyHolder: true      // застрахованный является страхователем
            },
            calcData: {
                valuationType: 'byLimit', // расчет от лимита
                limit: 2000000            // 2 млн рублей
            }
        }
    };

    console.log('📤 Отправляем запрос:');
    console.log(JSON.stringify(requestData, null, 2));
    console.log('\n');

    try {
        const response = await axios.post(API_URL, requestData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        console.log('✅ Ответ получен:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.success && response.data.data?.results) {
            const results = response.data.data.results;
            console.log('\n📊 РЕЗУЛЬТАТЫ РАСЧЕТА:');
            console.log('='.repeat(50));
            console.log(`Срок страхования: ${results.term} лет`);
            console.log(`Страховая сумма: ${results.limit?.toLocaleString('ru-RU')} ${requestData.data.insConditions.currency}`);
            console.log(`Премия: ${results.premium?.toLocaleString('ru-RU')} ${requestData.data.insConditions.currency}`);
            console.log(`Премия в рублях: ${results.premiumRUR?.toLocaleString('ru-RU')} RUR`);

            if (results.risks && results.risks.length > 0) {
                console.log('\n📋 Риски:');
                results.risks.forEach((risk, idx) => {
                    console.log(`\n${idx + 1}. ${risk.name} (${risk.code})`);
                    console.log(`   Тип: ${risk.type}`);
                    console.log(`   Тариф: ${risk.tariff}`);
                    console.log(`   Страховая сумма: ${risk.limit?.toLocaleString('ru-RU')} ${requestData.data.insConditions.currency}`);
                    console.log(`   Премия: ${risk.premium?.toLocaleString('ru-RU')} ${requestData.data.insConditions.currency}`);
                });
            }

            if (results.paymentsList && results.paymentsList.length > 0) {
                console.log(`\n💰 График платежей (первые 5 из ${results.paymentsList.length}):`);
                results.paymentsList.slice(0, 5).forEach(payment => {
                    const date = new Date(payment.date);
                    console.log(`   Платеж ${payment.i}: ${payment.premium?.toLocaleString('ru-RU')} RUR (${date.toLocaleDateString('ru-RU')})`);
                });
                if (results.paymentsList.length > 5) {
                    console.log(`   ... и еще ${results.paymentsList.length - 5} платежей`);
                }
            }
            console.log('='.repeat(50));
        }

        if (response.data.data?.warnings && response.data.data.warnings.length > 0) {
            console.log('\n⚠️  ПРЕДУПРЕЖДЕНИЯ:');
            response.data.data.warnings.forEach(warning => {
                console.log(`   - ${warning}`);
            });
        }

    } catch (error) {
        console.error('❌ Ошибка при выполнении запроса:');

        if (error.response) {
            console.error(`Статус: ${error.response.status}`);
            console.error('Ответ сервера:', JSON.stringify(error.response.data, null, 2));

            if (error.response.status === 401) {
                console.error('\n⚠️  Требуется авторизация. Необходимо добавить Bearer токен в заголовок Authorization.');
            }

            if (error.response.data?.errors) {
                console.error('\n🔴 Ошибки валидации:');
                if (Array.isArray(error.response.data.errors)) {
                    error.response.data.errors.forEach(err => {
                        console.error(`   - [${err.code}] ${err.text}`);
                        if (err.path) console.error(`     Путь: ${err.path}`);
                    });
                } else {
                    console.error(`   - [${error.response.data.errors.code}] ${error.response.data.errors.text}`);
                }
            }
        } else if (error.request) {
            console.error('Запрос был отправлен, но ответ не получен');
            console.error(error.message);
        } else {
            console.error('Ошибка:', error.message);
        }
    }
}

// Запустить тест
calculateLifeInsurance();
