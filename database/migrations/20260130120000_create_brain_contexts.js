/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('constructor_brain_contexts', (table) => {
        table.bigIncrements('id').primary();
        table.string('title', 255).notNullable();
        table.text('content').notNullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.integer('priority').notNullable().defaultTo(0);
        table.timestamps(true, true);

        table.index(['is_active']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('constructor_brain_contexts');
};
