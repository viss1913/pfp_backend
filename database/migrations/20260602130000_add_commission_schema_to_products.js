/**
 * Add per-product commission configuration schema.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('products', (table) => {
        table.json('commission_schema').nullable().comment('Per-product commission rules for CRM forecast');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('products', (table) => {
        table.dropColumn('commission_schema');
    });
};

