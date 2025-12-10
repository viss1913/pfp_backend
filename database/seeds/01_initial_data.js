/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
    // Очистка существующих данных (в порядке зависимостей)
    await knex('portfolios').del();
    await knex('products').del();
    await knex('portfolio_classes').del();

    // 1. Создаём классы портфелей
    await knex('portfolio_classes').insert([
        { id: 1, code: 'PENSION', name: 'Пенсия' },
        { id: 2, code: 'PASSIVE_INCOME', name: 'Пассивный доход' },
        { id: 3, code: 'INVESTMENT', name: 'Инвестиции' },
        { id: 4, code: 'OTHER', name: 'Прочее' },
        { id: 5, code: 'LIFE', name: 'Жизнь' },
        { id: 6, code: 'GOS_PENSION', name: 'Госпенсия' }
    ]);

    // 2. Создаём продукт ПДС НПФ (agent_id = NULL = дефолтный) с линией доходности
    const [pdsProductId] = await knex('products').insert({
        agent_id: null, // Дефолтный продукт
        name: 'ПДС НПФ',
        product_type: 'PDS',
        currency: 'RUB',
        lines: JSON.stringify([{
            min_term_months: 0,
            max_term_months: 100,
            min_amount: 0,
            max_amount: 100000000000000000, // 100 квадриллионов (как на скрине)
            yield_percent: 12.00
        }]),
        is_active: true,
        is_default: true
    });

    // 3. Создаём портфели для всех классов (все одинаковые, только ПДС)
    const portfolioClasses = [
        { code: 'PENSION', name: 'Пенсия' },
        { code: 'PASSIVE_INCOME', name: 'Пассивный доход' },
        { code: 'INVESTMENT', name: 'Инвестиции' },
        { code: 'OTHER', name: 'Прочее' },
        { code: 'LIFE', name: 'Жизнь' },
        { code: 'GOS_PENSION', name: 'Госпенсия' }
    ];

    for (const portfolioClass of portfolioClasses) {
        // Получаем ID класса
        const classRecord = await knex('portfolio_classes')
            .where('code', portfolioClass.code)
            .first();

        // Создаём риск-профили в JSON формате
        const riskProfiles = [
            {
                profile_type: 'CONSERVATIVE',
                potential_yield_percent: 12.00,
                initial_capital: [{
                    product_id: pdsProductId,
                    share_percent: 100.00,
                    order_index: 1
                }],
                top_up: [{
                    product_id: pdsProductId,
                    share_percent: 100.00,
                    order_index: 1
                }]
            },
            {
                profile_type: 'BALANCED',
                potential_yield_percent: 12.00,
                initial_capital: [{
                    product_id: pdsProductId,
                    share_percent: 100.00,
                    order_index: 1
                }],
                top_up: [{
                    product_id: pdsProductId,
                    share_percent: 100.00,
                    order_index: 1
                }]
            },
            {
                profile_type: 'AGGRESSIVE',
                potential_yield_percent: 12.00,
                initial_capital: [{
                    product_id: pdsProductId,
                    share_percent: 100.00,
                    order_index: 1
                }],
                top_up: [{
                    product_id: pdsProductId,
                    share_percent: 100.00,
                    order_index: 1
                }]
            }
        ];

        // Создаём портфель с JSON полями
        await knex('portfolios').insert({
            agent_id: null, // Дефолтный портфель
            name: portfolioClass.name,
            currency: 'RUB',
            amount_from: 0,
            amount_to: 999999999999999, // Без ограничений
            term_from_months: 0,
            term_to_months: 100,
            age_from: null,
            age_to: null,
            investor_type: null,
            gender: null,
            classes: JSON.stringify([classRecord.id]),
            risk_profiles: JSON.stringify(riskProfiles),
            created_by: null, // Система создала
            updated_by: null,
            is_active: true,
            is_default: true
        });
    }

    console.log('✅ Seed data inserted successfully!');
};
