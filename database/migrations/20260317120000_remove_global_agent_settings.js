/**
 * Убираем из глобальных настроек ключи, которые настраиваются агентом на уровне проекта:
 * - инфляция (inflation_rate_year, inflation_rate_matrix)
 * - рост расходов на инвестиции (investment_expense_growth_monthly, investment_expense_growth_annual)
 * - доходность пассивного дохода (passive_income_yield)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const AGENT_OWNED_KEYS = [
    'inflation_rate_year',
    'inflation_rate_matrix',
    'investment_expense_growth_monthly',
    'investment_expense_growth_annual',
    'passive_income_yield'
];

exports.up = function (knex) {
    return knex('system_settings')
        .whereNull('project_id')
        .whereIn('key', AGENT_OWNED_KEYS)
        .del();
};

exports.down = function (knex) {
    // Восстановление глобальных дефолтов при откате (минимальный набор)
    const defaults = [
        { key: 'inflation_rate_year', value: '4.00', value_type: 'number', description: 'Годовая инфляция по умолчанию (%)', category: 'calculation' },
        { key: 'investment_expense_growth_monthly', value: '0.33', value_type: 'number', description: 'Рост расходов на инвестиции (% в месяц)', category: 'calculation' },
        { key: 'investment_expense_growth_annual', value: '4', value_type: 'number', description: 'Рост расходов на инвестиции (% годовых)', category: 'calculation' },
        { key: 'passive_income_yield', value: JSON.stringify([{ min_term_months: 0, max_term_months: 60, min_amount: 0, max_amount: 1000000000000, yield_percent: 14.0 }]), value_type: 'json', description: 'Линии доходности пассивного дохода', category: 'passive_income' }
    ];
    return knex('system_settings').insert(defaults.map(row => ({ ...row, project_id: null })));
};
