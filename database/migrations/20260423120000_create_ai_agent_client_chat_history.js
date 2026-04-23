/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    const exists = await knex.schema.hasTable('ai_agent_client_chat_history');
    if (exists) {
        await knex.schema.dropTable('ai_agent_client_chat_history');
    }

    await knex.schema.createTable('ai_agent_client_chat_history', (table) => {
        table.increments('id').primary();
        table.integer('agent_id').unsigned().notNullable();
        table.integer('assistant_id').unsigned().notNullable()
            .references('id')
            .inTable('ai_assistants')
            .onDelete('CASCADE');
        table.bigInteger('client_id').unsigned().notNullable()
            .references('id')
            .inTable('clients')
            .onDelete('CASCADE');
        table.enu('role', ['user', 'assistant']).notNullable();
        table.text('content').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['agent_id', 'assistant_id', 'client_id', 'created_at'], 'idx_ai_agent_client_chat_scope');
        table.index(['client_id'], 'idx_ai_agent_client_chat_client');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
    const exists = await knex.schema.hasTable('ai_agent_client_chat_history');
    if (!exists) return;
    await knex.schema.dropTable('ai_agent_client_chat_history');
};
