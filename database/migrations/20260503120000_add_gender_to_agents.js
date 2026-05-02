/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.string('gender', 10).nullable(); // 'male', 'female' — как у clients
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.dropColumn('gender');
    });
};
