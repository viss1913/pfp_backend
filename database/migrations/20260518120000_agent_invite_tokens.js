/**
 * One-time magic-link tokens for family-office agent provisioning.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('agent_invite_tokens', (table) => {
        table.bigIncrements('id').primary();
        table.string('token', 128).notNullable().unique();
        table.bigInteger('user_id').unsigned().notNullable();
        table.bigInteger('agent_id').unsigned().notNullable();
        table.bigInteger('project_id').unsigned().notNullable();
        table.bigInteger('invited_by_agent_id').unsigned().nullable();
        table.timestamp('expires_at').notNullable();
        table.timestamp('used_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('agent_id').references('id').inTable('agents').onDelete('CASCADE');
        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.foreign('invited_by_agent_id').references('id').inTable('agents').onDelete('SET NULL');
        table.index(['agent_id']);
        table.index(['expires_at']);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('agent_invite_tokens');
};
