/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
    // Очистка существующих данных (в порядке зависимостей)
    await knex('portfolio_instruments').del();
    await knex('portfolio_risk_profiles').del();
    await knex('portfolio_class_links').del();
    await knex('portfolios').del();
    await knex('products').del();
    await knex('portfolio_classes').del();

    // 1. Создаём классы портфелей
    await knex('portfolio_classes').insert([
        { id: 1, code: 'PENSION', name: 'Пенсия' },
        { id: 2, code: 'PASSIVE_INCOME', name: 'Пассивный доход' },
        { id: 3, code: 'INVESTMENT', name: 'Инвестиции' },
        { id: 4, code: 'OTHER', name: 'Прочее' }
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

    // 4. Создаём портфели для всех классов (все одинаковые, только ПДС)
    const portfolioClasses = [
        { code: 'PENSION', name: 'Пенсия' },
        { code: 'PASSIVE_INCOME', name: 'Пассивный доход' },
        { code: 'INVESTMENT', name: 'Инвестиции' },
        { code: 'OTHER', name: 'Прочее' }
    ];

    for (const portfolioClass of portfolioClasses) {
        // Создаём портфель
        const [portfolioId] = await knex('portfolios').insert({
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
            is_active: true,
            is_default: true
        });

        // Привязываем класс к портфелю
        const classRecord = await knex('portfolio_classes')
            .where('code', portfolioClass.code)
            .first();

        await knex('portfolio_class_links').insert({
            portfolio_id: portfolioId,
            class_id: classRecord.id
        });

        // Создаём три риск-профиля (консервативный, сбалансированный, агрессивный)
        const riskProfiles = [
            { type: 'CONSERVATIVE', yield: 12.00 },
            { type: 'BALANCED', yield: 12.00 },
            { type: 'AGGRESSIVE', yield: 12.00 }
        ];

        for (const profile of riskProfiles) {
            const [profileId] = await knex('portfolio_risk_profiles').insert({
                portfolio_id: portfolioId,
                profile_type: profile.type,
                potential_yield_percent: profile.yield
            });

            // Добавляем инструменты (100% ПДС для обоих типов капитала)
            await knex('portfolio_instruments').insert([
                {
                    portfolio_risk_profile_id: profileId,
                    product_id: pdsProductId,
                    bucket_type: 'INITIAL_CAPITAL',
                    share_percent: 100.00,
                    order_index: 1
                },
                {
                    portfolio_risk_profile_id: profileId,
                    product_id: pdsProductId,
                    bucket_type: 'TOP_UP',
                    share_percent: 100.00,
                    order_index: 1
                }
            ]);
        }
    }

    console.log('✅ Seed data inserted successfully!');
};
