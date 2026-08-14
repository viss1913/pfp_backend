/**
 * One-time SSO tickets: IDE → agent LK (/cabinet?sso_ticket=…).
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('agent_sso_tickets', (table) => {
        table.bigIncrements('id').primary();
        table.string('ticket', 128).notNullable().unique();
        table.bigInteger('user_id').unsigned().notNullable();
        table.bigInteger('agent_id').unsigned().notNullable();
        table.bigInteger('project_id').unsigned().notNullable();
        table.string('email', 255).notNullable();
        table.string('return_path', 255).notNullable().defaultTo('/cabinet');
        table.timestamp('expires_at').notNullable();
        table.timestamp('used_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('agent_id').references('id').inTable('agents').onDelete('CASCADE');
        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.index(['expires_at']);
        table.index(['email', 'project_id']);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('agent_sso_tickets');
};
