/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('constructor_bots', (table) => {
        table.string('link', 255).nullable().after('name');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('constructor_bots', (table) => {
        table.dropColumn('link');
    });
};
