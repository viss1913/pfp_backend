/**
 * Добавление JSON полей classes и risk_profiles в таблицу portfolios
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('portfolios', (table) => {
        // Добавляем JSON поле для хранения классов портфелей
        // Формат: [1, 2, 3] - массив ID классов
        table.json('classes').nullable().comment('JSON array of portfolio class IDs');
        
        // Добавляем JSON поле для хранения риск-профилей
        // Формат: [{"profile_type": "CONSERVATIVE", "potential_yield_percent": 12.00, "initial_capital": [...], "top_up": [...]}]
        table.json('risk_profiles').nullable().comment('JSON array of risk profiles with instruments');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('portfolios', (table) => {
        table.dropColumn('classes');
        table.dropColumn('risk_profiles');
    });
};

