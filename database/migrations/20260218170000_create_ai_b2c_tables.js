/**
 * Миграция: Система AI B2C
 * 
 * Создаёт 3 таблицы:
 * - ai_b2c_brain_contexts — Главный Мозг (базовые настройки ИИ для B2C)
 * - ai_b2c_stage_contexts — Контексты этапов (промпты по страницам)
 * - ai_b2c_chat_messages  — История чата клиента с ИИ
 */

exports.up = async function (knex) {
    // Очистка от предыдущей неудачной миграции
    await knex.schema.dropTableIfExists('ai_b2c_chat_messages');
    await knex.schema.dropTableIfExists('ai_b2c_stage_contexts');
    await knex.schema.dropTableIfExists('ai_b2c_brain_contexts');

    // 1. Главный Мозг B2C
    await knex.schema.createTable('ai_b2c_brain_contexts', (table) => {
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

    // 2. Контексты этапов B2C
    await knex.schema.createTable('ai_b2c_stage_contexts', (table) => {
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

    // 3. История чата B2C
    await knex.schema.createTable('ai_b2c_chat_messages', (table) => {
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
    await knex.schema.dropTableIfExists('ai_b2c_chat_messages');
    await knex.schema.dropTableIfExists('ai_b2c_stage_contexts');
    await knex.schema.dropTableIfExists('ai_b2c_brain_contexts');
};
