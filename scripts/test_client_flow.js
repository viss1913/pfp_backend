require('dotenv').config({ override: true });
const clientService = require('../src/services/clientService');
const calculationService = require('../src/services/calculationService');
const knex = require('../src/config/database');

async function testFullFlow() {
    console.log('\n🚀 --- ЗАПУСК ТЕСТА: СОЗДАНИЕ КЛИЕНТА И РАСЧЕТ ЦЕЛИ "ДОМ" ---\n');

    try {
        // --- ШАГ 0: Подготовка (Поиск подходящего класса актива) ---
        console.log('🔍 1. Проверяем доступные классы портфелей в БД...');
        const classes = await knex('portfolio_classes').select('*');

        if (classes.length === 0) {
            throw new Error('В таблице portfolio_classes нет записей. Запустите сиды (seeds) или миграции с данными.');
        }

        console.log('   Доступные классы:', classes.map(c => `${c.id}=${c.code}`).join(', '));

        // User requested to use OTHER type (ID=4 usually)
        let targetClass = classes.find(c => c.code === 'OTHER' || c.code === 'Other');

        if (!targetClass) {
            console.log('   Warning: Класс OTHER не найден. Ищем REAL_ESTATE или любой другой...');
            // Fallback
            targetClass = classes.find(c => c.code === 'REAL_ESTATE') || classes.find(c => ![5, 6].includes(c.id)) || classes[0];
        }

        console.log(`✅ Выбран класс для цели: [ID: ${targetClass.id}] ${targetClass.name || targetClass.code}`);

        // Проверяем, есть ли портфели под этот класс, чтобы подстроить сумму/срок теста
        const portfolio = await knex('portfolios')
            .where('id', 'in', knex('portfolio_class_links').select('portfolio_id').where('class_id', targetClass.id))
            .first();

        let testTargetAmount = 15000000; // 15 млн по умолчанию
        let testTermMonths = 60; // 5 лет

        if (portfolio) {
            console.log(`   Найден портфель "${portfolio.name}". Подстраиваем параметры теста под его лимиты...`);
            // Если наши дефолтные значения выходят за рамки портфеля, правим их
            if (testTargetAmount < portfolio.amount_from) testTargetAmount = Number(portfolio.amount_from) + 1000;
            if (testTargetAmount > portfolio.amount_to) testTargetAmount = Number(portfolio.amount_to) - 1000;
            if (testTargetAmount <= 0) testTargetAmount = 100000; // Fallback to safe positive

            if (testTermMonths < portfolio.term_from_months) testTermMonths = Number(portfolio.term_from_months);
            if (testTermMonths > portfolio.term_to_months) testTermMonths = Number(portfolio.term_to_months);
            if (testTermMonths <= 0) testTermMonths = 12; // Fallback
        } else {
            console.log('⚠️ ВНИМАНИЕ: Портфели для этого класса не найдены. Расчет может выдать ошибку "Portfolio not found".');
        }

        console.log(`   Параметры цели: Сумма = ${testTargetAmount}, Срок = ${testTermMonths} мес.`);


        // --- ШАГ 1: Создание Клиента ---
        console.log('\n👤 2. Создаем клиента в Базе Данных...');

        const clientPayload = {
            client: {
                first_name: 'Тест',
                last_name: 'Тестов',
                middle_name: 'Иванович',
                birth_date: '1988-05-20',
                gender: 'male',
                avg_monthly_income: 300000, // 300к доход
                employment_type: 'EMPLOYED',
                tax_mode: 'OSN',
                phone: '+79991234567',
                email: `test_${Date.now()}@example.com` // уникальный email
            },
            assets: [
                { type: 'DEPOSIT', name: 'Вклад "Накопительный"', current_value: 2000000, currency: 'RUB', yield_percent: 12 },
                { type: 'CASH', name: 'Наличные', current_value: 500000, currency: 'RUB' }
            ],
            liabilities: [
                { type: 'CAR_LOAN', name: 'Автокредит', remaining_amount: 1000000, monthly_payment: 35000 }
            ],
            expenses: [
                { category: 'LIVING', amount: 60000 },
                { category: 'HOUSING', amount: 15000 }
            ]
        };

        const clientId = await clientService.createFullClient(clientPayload);
        console.log(`✅ Клиент успешно создан! ID: ${clientId}`);

        // Проверяем, что сохранилось
        const savedClient = await clientService.getFullClient(clientId);
        console.log(`   Net Worth (Чистый капитал) в БД: ${savedClient.net_worth} RUB (Ожидалось: 2.5млн - 1млн = 1.5млн)`);
        console.log(`   Активов: ${savedClient.assets.length}, Обязательств: ${savedClient.liabilities.length}`);


        // --- ШАГ 2: Расчет Цели ---
        console.log('\n🧮 3. Отправляем цель "Дом" на расчет...');

        // Для расчета используем данные созданного клиента + параметры новой цели
        const calculationRequest = {
            client: {
                birth_date: savedClient.birth_date, // '1988-05-20'
                sex: savedClient.gender,
                avg_monthly_income: Number(savedClient.avg_monthly_income),
                // Можно передать ИПК, если есть
            },
            goals: [
                {
                    goal_type_id: targetClass.id, // ID который мы нашли в начале
                    name: 'Дом', // Requested name
                    target_amount: testTargetAmount,
                    term_months: testTermMonths,
                    risk_profile: 'BALANCED', // Сбалансированный
                    initial_capital: 1000000, // Например, используем 1млн из активов
                    inflation_rate: 10
                }
            ]
        };

        const result = await calculationService.calculateFirstRun(calculationRequest);

        console.log('\n📄 --- РЕЗУЛЬТАТ РАСЧЕТА ---');
        console.log(JSON.stringify(result, null, 2));

        // Check result (Handle different return structures)
        const resItem = result.results ? result.results[0] : (Array.isArray(result) ? result[0] : result);

        if (!resItem) {
            console.error('\n❌ ОШИБКА: Пустой результат');
        } else if (resItem.error) {
            console.error('\n❌ ОШИБКА В РАСЧЕТЕ:', resItem.error);
        } else if (resItem.portfolio) {
            console.log('\n✅ УСПЕХ: Портфель подобран!');
            console.log(`   Подобранный портфель: ${resItem.portfolio.name}`);
            console.log(`   Средневзвешенная доходность: ${resItem.weighted_yield_annual}%`);
            console.log(`   Рекомендованный ежемесячный взнос: ${resItem.financials.recommended_replenishment} RUB`);
        } else {
            console.log('\n⚠️ Результат получен (структура нестандартная).');
        }

    } catch (error) {
        console.error('\n🔴 CRITICAL ERROR:', error);
    } finally {
        console.log('\n👋 Тест завершен.');
        process.exit();
    }
}

testFullFlow();
