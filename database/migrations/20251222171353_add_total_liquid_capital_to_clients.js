/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('clients', (table) => {
        table.decimal('total_liquid_capital', 18, 2).defaultTo(0).after('ipk_current');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('clients', (table) => {
        table.dropColumn('total_liquid_capital');
    });
};
