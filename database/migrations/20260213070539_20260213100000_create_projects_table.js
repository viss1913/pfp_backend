/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('projects', (table) => {
        table.bigIncrements('id').primary();
        table.string('name', 255).notNullable();
        table.string('slug', 100).unique().notNullable();
        table.string('public_key', 64).unique().notNullable();
        table.enum('status', ['active', 'suspended']).notNullable().defaultTo('active');
        table.json('settings').nullable();
        table.timestamps(true, true);

        table.index(['public_key']);
        table.index(['slug']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('projects');
};
