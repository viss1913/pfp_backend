/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // 1. Create ai_assistants table
    await knex.schema.createTable('ai_assistants', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable().comment('Human readable name e.g. AI CRM');
        table.string('slug').unique().notNullable().comment('Unique slug for frontend/api identification e.g. ai-crm');
        table.text('context_template').nullable().comment('System prompt template. Supports {{agent_name}} placeholder');
        table.string('model').defaultTo('google/gemini-2.0-flash-exp:free').comment('OpenRouter model ID');
        table.boolean('is_active').defaultTo(true);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // 2. Create ai_chat_history table
    await knex.schema.createTable('ai_chat_history', (table) => {
        table.increments('id').primary();
        table.integer('agent_id').unsigned().notNullable(); // References users.id (assuming users table exists and id is int)
        table.integer('assistant_id').unsigned().notNullable().references('id').inTable('ai_assistants').onDelete('CASCADE');
        table.enu('role', ['user', 'assistant']).notNullable();
        table.text('content').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['agent_id', 'assistant_id']); // Optimization for fetching history
    });

    // 3. Seed initial assistants
    await knex('ai_assistants').insert([
        {
            name: 'AI CRM',
            slug: 'ai-crm',
            context_template: 'Ты опытный бизнес-ассистент для финансового консультанта (Агента). Твоя задача - помогать анализировать клиентов, подсказывать следующие шаги продаж и напоминать о важных событиях. Ты общаешься с агентом по имени {{agent_name}}. Будь вежлив, профессионален и краток.',
            model: 'google/gemini-2.0-flash-exp:free',
            is_active: true
        },
        {
            name: 'AI PFP',
            slug: 'ai-pfp',
            context_template: 'Ты эксперт по личным финансам и продуктам компании. Ты помогаешь агенту {{agent_name}} разобраться в линейке продуктов (НСЖ, ПДС, Вклады) и составить оптимальный финансовый план для клиента. Используй знания о продуктах PFP.',
            model: 'google/gemini-2.0-flash-exp:free',
            is_active: true
        }
    ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('ai_chat_history');
    await knex.schema.dropTableIfExists('ai_assistants');
};
