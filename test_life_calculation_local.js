const nsjApiService = require('./src/services/nsjApiService');

/**
 * Тестовый скрипт для проверки расчета страхования жизни
 * Запуск: node test_life_calculation_local.js
 */

async function testLifeCalculation() {
    console.log('='.repeat(70));
    console.log('ТЕСТ РАСЧЕТА СТРАХОВАНИЯ ЖИЗНИ');
    console.log('='.repeat(70));
    console.log('');

    // Тестовые данные (пример из документации: Мужчина, 35 лет, 2.5 млн, 20 лет)
    const testParams = {
        target_amount: 2500000,  // Страховая сумма: 2.5 млн рублей
        term_months: 240,        // Срок: 20 лет (240 месяцев)
        payment_variant: 0,      // 0 - единовременно, 12 - ежемесячно
        program: 'test',          // Код программы
        client: {
            birth_date: '1989-01-01',  // Дата рождения: 01.01.1989 (35 лет)
            sex: 'male',               // Пол: мужской
            fio: 'Иванов Иван Иванович',
            phone: '+79991234567',
            email: 'test@example.com'
        }
    };

    console.log('Параметры расчета:');
    console.log(JSON.stringify(testParams, null, 2));
    console.log('');
    console.log('Отправка запроса к NSJ API...');
    console.log('');

    try {
        const result = await nsjApiService.calculateLifeInsurance(testParams);

        console.log('='.repeat(70));
        console.log('✅ РАСЧЕТ УСПЕШЕН!');
        console.log('='.repeat(70));
        console.log('');
        console.log('Результаты расчета:');
        console.log('- Срок страхования:', result.term, 'лет');
        console.log('- Общая премия:', result.total_premium, 'руб.');
        console.log('- Общая страховая сумма:', result.total_limit, 'руб.');
        console.log('- Количество рисков:', result.risks?.length || 0);
        console.log('');

        if (result.risks && result.risks.length > 0) {
            console.log('Детали рисков:');
            result.risks.forEach((risk, index) => {
                console.log(`  ${index + 1}. ${risk.name || risk.code}`);
                console.log(`     Премия: ${risk.premiumRUR || risk.premium} руб.`);
                console.log(`     Страховая сумма: ${risk.limitRUR || risk.limit} руб.`);
            });
            console.log('');
        }

        if (result.payments_list && result.payments_list.length > 0) {
            console.log('График платежей (первые 5):');
            result.payments_list.slice(0, 5).forEach((payment, index) => {
                const date = new Date(payment.date);
                console.log(`  ${index + 1}. Дата: ${date.toLocaleDateString('ru-RU')}, Сумма: ${payment.premium} руб.`);
            });
            if (result.payments_list.length > 5) {
                console.log(`  ... и еще ${result.payments_list.length - 5} платежей`);
            }
            console.log('');
        }

        if (result.warnings && result.warnings.length > 0) {
            console.log('⚠️  Предупреждения:');
            result.warnings.forEach(warning => {
                console.log(`  - ${warning}`);
            });
            console.log('');
        }

        console.log('Полный ответ (raw_response):');
        console.log(JSON.stringify(result.raw_response, null, 2));

    } catch (error) {
        console.log('='.repeat(70));
        console.log('❌ ОШИБКА ПРИ РАСЧЕТЕ');
        console.log('='.repeat(70));
        console.log('');
        console.error('Детали ошибки:');
        console.error(JSON.stringify(error, null, 2));
        console.log('');
        
        if (error.status) {
            console.error('HTTP статус:', error.status);
        }
        if (error.message) {
            console.error('Сообщение:', error.message);
        }
        if (error.errors) {
            console.error('Ошибки API:', error.errors);
        }
        if (error.warnings) {
            console.error('Предупреждения:', error.warnings);
        }
        
        process.exit(1);
    }
}

// Запускаем тест
testLifeCalculation()
    .then(() => {
        console.log('');
        console.log('='.repeat(70));
        console.log('Тест завершен');
        console.log('='.repeat(70));
        process.exit(0);
    })
    .catch((error) => {
        console.error('Критическая ошибка:', error);
        process.exit(1);
    });
























