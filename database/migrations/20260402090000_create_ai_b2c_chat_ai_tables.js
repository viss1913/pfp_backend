/**
 * Migration: AI B2C chat (separate contexts + history)
 *
 * Это отдельная версия контекстов для endpoint'а:
 *   POST /api/my/ai-b2c/chat_AI/stream
 *
 * Чтобы не ломать уже настроенный site-flow:
 *   POST /api/my/ai-b2c/chat/stream
 */
exports.up = async function (knex) {
    // Cleanup from previous failed attempts
    await knex.schema.dropTableIfExists('ai_b2c_chat_ai_messages');
    await knex.schema.dropTableIfExists('ai_b2c_chat_stage_contexts');
    await knex.schema.dropTableIfExists('ai_b2c_chat_brain_contexts');

    // 1) Brain contexts (chat)
    await knex.schema.createTable('ai_b2c_chat_brain_contexts', (table) => {
        table.increments('id').primary();
        table.bigInteger('project_id').unsigned().nullable();
        table.string('title', 255).notNullable();
        table.text('content').notNullable();
        table.boolean('is_active').defaultTo(true);
        table.integer('priority').defaultTo(0);
        table.timestamps(true, true);

        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.index(['project_id', 'is_active']);
    });

    // 2) Stage contexts (chat)
    await knex.schema.createTable('ai_b2c_chat_stage_contexts', (table) => {
        table.increments('id').primary();
        table.bigInteger('project_id').unsigned().nullable();
        table.string('stage_key', 100).notNullable();
        table.string('title', 255).notNullable();
        table.text('content').notNullable();
        table.boolean('is_active').defaultTo(true);
        table.integer('priority').defaultTo(0);
        table.timestamps(true, true);

        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.unique(['project_id', 'stage_key']);
        table.index(['project_id', 'stage_key', 'is_active']);
    });

    // 3) Chat history for chat_AI endpoint
    await knex.schema.createTable('ai_b2c_chat_ai_messages', (table) => {
        table.increments('id').primary();
        table.bigInteger('client_id').unsigned().notNullable();
        table.string('stage_key', 100).notNullable();
        table.enum('role', ['user', 'assistant']).notNullable();
        table.text('content').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.foreign('client_id').references('id').inTable('clients').onDelete('CASCADE');
        table.index(['client_id', 'stage_key']);
        table.index(['client_id', 'created_at']);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('ai_b2c_chat_ai_messages');
    await knex.schema.dropTableIfExists('ai_b2c_chat_stage_contexts');
    await knex.schema.dropTableIfExists('ai_b2c_chat_brain_contexts');
};

