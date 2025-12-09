/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('users', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('agent_id').unsigned().nullable()
            .references('id').inTable('agents').onDelete('CASCADE');
        table.string('email', 255).unique().notNullable();
        table.string('password_hash', 255).notNullable();
        table.string('name', 255).notNullable();
        table.enum('role', ['admin', 'agent']).notNullable().defaultTo('agent');
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamps(true, true);

        table.index(['email']);
        table.index(['agent_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('users');
};
