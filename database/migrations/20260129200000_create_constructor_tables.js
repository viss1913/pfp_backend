/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // 1. Bots
        .createTable('constructor_bots', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('agent_id').unsigned().notNullable()
                .references('id').inTable('agents').onDelete('CASCADE');
            table.string('name', 255).notNullable();
            table.string('token', 255).notNullable();
            table.text('communication_style').nullable();
            table.text('base_brain_context').nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.timestamps(true, true);

            table.index(['agent_id']);
            table.index(['is_active']);
        })

        // 2. CJM Commands/States
        .createTable('constructor_commands', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('bot_id').unsigned().nullable()
                .references('id').inTable('constructor_bots').onDelete('CASCADE'); // Null if global template
            table.string('command', 100).notNullable();
            table.text('classifier').notNullable();
            table.text('response').notNullable();
            table.string('section', 100).nullable();
            table.boolean('is_template').notNullable().defaultTo(false);
            table.timestamps(true, true);

            table.index(['bot_id']);
            table.index(['command']);
        })

        // 3. Clients (User in Telegram)
        .createTable('constructor_clients', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('bot_id').unsigned().notNullable()
                .references('id').inTable('constructor_bots').onDelete('CASCADE');
            table.string('user_id', 100).notNullable(); // Telegram User ID
            table.string('nickname', 255).nullable();
            table.text('user_context').nullable();
            table.timestamps(true, true);

            table.unique(['bot_id', 'user_id']);
            table.index(['user_id']);
        })

        // 4. Sessions (Current state of client)
        .createTable('constructor_sessions', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('client_id').unsigned().notNullable()
                .references('id').inTable('constructor_clients').onDelete('CASCADE');
            table.bigInteger('current_command_id').unsigned().nullable()
                .references('id').inTable('constructor_commands').onDelete('SET NULL');
            table.timestamps(true, true);

            table.unique(['client_id']);
        })

        // 5. Logs for debugging classification
        .createTable('constructor_logs', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('session_id').unsigned().notNullable()
                .references('id').inTable('constructor_sessions').onDelete('CASCADE');
            table.text('input_text').notNullable();
            table.bigInteger('detected_command_id').unsigned().nullable()
                .references('id').inTable('constructor_commands').onDelete('SET NULL');
            table.text('response_generated').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());

            table.index(['session_id']);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('constructor_logs')
        .dropTableIfExists('constructor_sessions')
        .dropTableIfExists('constructor_clients')
        .dropTableIfExists('constructor_commands')
        .dropTableIfExists('constructor_bots');
};
