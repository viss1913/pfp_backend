/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('clients', (table) => {
        table.decimal('spouse_avg_monthly_income', 18, 2).nullable().after('avg_monthly_income');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('clients', (table) => {
        table.dropColumn('spouse_avg_monthly_income');
    });
};
