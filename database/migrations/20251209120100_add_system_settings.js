/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .createTable('system_settings', (table) => {
            table.increments('id').primary();
            table.string('key', 100).unique().notNullable(); // Уникальный ключ настройки
            table.text('value').notNullable(); // Значение (JSON или строка)
            table.string('value_type', 20).notNullable().defaultTo('string'); // string, number, json
            table.string('description', 500).nullable(); // Описание для админки
            table.string('category', 50).nullable(); // Категория (inflation, pension, etc.)
            table.timestamps(true, true);
        })
        .then(() => {
            // Вставляем дефолтные значения
            return knex('system_settings').insert([
                {
                    key: 'inflation_rate_year',
                    value: '4.00', // 4% годовых
                    value_type: 'number',
                    description: 'Годовая инфляция по умолчанию (%)',
                    category: 'calculation'
                },
                {
                    key: 'investment_expense_growth_monthly',
                    value: '0.00', // 0% - без роста по умолчанию
                    value_type: 'number',
                    description: 'Рост расходов на инвестиции (% в месяц)',
                    category: 'calculation'
                },
                // Параметры госпенсии (из скриншота)
                {
                    key: 'pension_pfr_contribution_rate_part1',
                    value: '22.00',
                    value_type: 'number',
                    description: 'Взнос в ПФР страховая часть от ЗП 1 (%)',
                    category: 'pension'
                },
                {
                    key: 'pension_pfr_contribution_rate_part2',
                    value: '10.00',
                    value_type: 'number',
                    description: 'Взнос в ПФР страховая часть от ЗП 2 (%)',
                    category: 'pension'
                },
                {
                    key: 'pension_fixed_payment',
                    value: '8907.00',
                    value_type: 'number',
                    description: 'Фиксированная выплата (руб.)',
                    category: 'pension'
                },
                {
                    key: 'pension_point_cost',
                    value: '145.69',
                    value_type: 'number',
                    description: 'Стоимость балла (руб.)',
                    category: 'pension'
                },
                {
                    key: 'pension_survival_period',
                    value: '264.00',
                    value_type: 'number',
                    description: 'Дожитие (месяцев)',
                    category: 'pension'
                },
                {
                    key: 'pension_max_salary_limit',
                    value: '2759000.00',
                    value_type: 'number',
                    description: 'Единый предельный размер базы (руб.)',
                    category: 'pension'
                },
                {
                    key: 'pension_ndc_rate',
                    value: '8.00',
                    value_type: 'number',
                    description: 'Доходность НДС (%)',
                    category: 'pension'
                }
            ]);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('system_settings');
};
