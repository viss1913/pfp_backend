/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.string('passport_series', 20).nullable();
        table.string('passport_number', 20).nullable();
        table.date('birth_date').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.dropColumns('passport_series', 'passport_number', 'birth_date');
    });
};
