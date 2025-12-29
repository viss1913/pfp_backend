/**
 * Добавление JSON поля lines в таблицу products для хранения линий доходности
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('products', (table) => {
        // Добавляем JSON поле для хранения линий доходности
        // Формат: [{"min_term_months": 0, "max_term_months": 100, "min_amount": 0, "max_amount": 1000000, "yield_percent": 12.00}]
        table.json('lines').nullable().comment('JSON array of product yield lines');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('products', (table) => {
        table.dropColumn('lines');
    });
};






















