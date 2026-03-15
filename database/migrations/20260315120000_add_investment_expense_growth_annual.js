/**
 * Добавление настройки investment_expense_growth_annual — рост расходов на инвестиции в % годовых.
 * В админке задаётся годовая ставка; в расчётах переводится в месячную: (1 + annual/100)^(1/12) - 1.
 * Если задана — используется она; иначе fallback на investment_expense_growth_monthly.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('system_settings')
        .where({ key: 'investment_expense_growth_annual' })
        .whereNull('project_id')
        .first()
        .then((row) => {
            if (row) return;
            return knex('system_settings').insert({
                project_id: null,
                key: 'investment_expense_growth_annual',
                value: '4',
                value_type: 'number',
                description: 'Рост расходов на инвестиции (% годовых). В расчётах переводится в месячную долю.',
                category: 'calculation'
            });
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('system_settings')
        .where({ key: 'investment_expense_growth_annual' })
        .whereNull('project_id')
        .del();
};
