const nsjApiService = require('./src/services/nsjApiService');

/**
 * Тестовый скрипт с детальными логами запроса к API партнера
 * Запуск: node test_life_with_logs.js
 */

// Перехватываем console.log для красивого вывода
const originalLog = console.log;
const originalError = console.error;

const logs = {
    request: [],
    response: [],
    errors: []
};

console.log = function(...args) {
    const message = args.join(' ');
    if (message.includes('NSJ API') || message.includes('calculateLifeInsurance')) {
        logs.request.push(message);
    }
    originalLog.apply(console, args);
};

console.error = function(...args) {
    const message = args.join(' ');
    logs.errors.push(message);
    originalError.apply(console, args);
};

async function testWithLogs() {
    console.log('='.repeat(80));
    console.log('ТЕСТ РАСЧЕТА СТРАХОВАНИЯ ЖИЗНИ С ДЕТАЛЬНЫМИ ЛОГАМИ');
    console.log('='.repeat(80));
    console.log('');

    const testParams = {
        target_amount: 2500000,
        term_months: 240,
        payment_variant: 0,
        program: 'test',
        client: {
            birth_date: '1989-01-01',
            sex: 'male',
            fio: 'Иванов Иван Иванович',
            phone: '+79991234567',
            email: 'test@example.com'
        }
    };

    console.log('Параметры расчета:');
    console.log(JSON.stringify(testParams, null, 2));
    console.log('');
    console.log('─'.repeat(80));
    console.log('ОТПРАВКА ЗАПРОСА К API ПАРТНЕРА');
    console.log('─'.repeat(80));
    console.log('');

    try {
        const result = await nsjApiService.calculateLifeInsurance(testParams);

        console.log('');
        console.log('─'.repeat(80));
        console.log('РЕЗУЛЬТАТЫ РАСЧЕТА');
        console.log('─'.repeat(80));
        console.log('');
        console.log('✅ Расчет успешен!');
        console.log('');
        console.log('Основные данные:');
        console.log('  • Срок страхования:', result.term, 'лет');
        console.log('  • Общая премия:', result.total_premium?.toLocaleString('ru-RU'), 'руб.');
        console.log('  • Страховая сумма:', result.total_limit?.toLocaleString('ru-RU'), 'руб.');
        console.log('  • Количество рисков:', result.risks?.length || 0);
        console.log('');

        if (result.risks && result.risks.length > 0) {
            console.log('Детализация по рискам:');
            result.risks.forEach((risk, index) => {
                console.log(`  ${index + 1}. ${risk.name || risk.code}`);
                console.log(`     Код: ${risk.code}`);
                console.log(`     Тип: ${risk.type}`);
                console.log(`     Тариф: ${risk.tariff}%`);
                console.log(`     Премия: ${(risk.premiumRUR || risk.premium)?.toLocaleString('ru-RU')} руб.`);
                console.log(`     Страховая сумма: ${(risk.limitRUR || risk.limit)?.toLocaleString('ru-RU')} руб.`);
                console.log('');
            });
        }

        if (result.payments_list && result.payments_list.length > 0) {
            console.log('График платежей:');
            result.payments_list.forEach((payment, index) => {
                const date = new Date(payment.date);
                const dueDate = new Date(payment.dueDate);
                console.log(`  Платеж ${payment.i}:`);
                console.log(`    Дата: ${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU')}`);
                console.log(`    Сумма: ${payment.premium?.toLocaleString('ru-RU')} руб.`);
                console.log(`    Оплатить до: ${dueDate.toLocaleDateString('ru-RU')}`);
                console.log('');
            });
        }

        if (result.warnings && result.warnings.length > 0) {
            console.log('⚠️  Предупреждения:');
            result.warnings.forEach(warning => {
                console.log(`  - ${warning}`);
            });
            console.log('');
        }

        console.log('─'.repeat(80));
        console.log('ПОЛНЫЙ ОТВЕТ ОТ API ПАРТНЕРА (raw_response)');
        console.log('─'.repeat(80));
        console.log(JSON.stringify(result.raw_response, null, 2));

    } catch (error) {
        console.log('');
        console.log('─'.repeat(80));
        console.log('❌ ОШИБКА ПРИ РАСЧЕТЕ');
        console.log('─'.repeat(80));
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

    // Восстанавливаем оригинальные функции
    console.log = originalLog;
    console.error = originalError;
}

testWithLogs()
    .then(() => {
        console.log('');
        console.log('='.repeat(80));
        console.log('Тест завершен');
        console.log('='.repeat(80));
        process.exit(0);
    })
    .catch((error) => {
        console.error('Критическая ошибка:', error);
        process.exit(1);
    });























