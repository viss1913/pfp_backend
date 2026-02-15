/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('constructor_bots', (table) => {
            table.string('bot_type', 50).notNullable().defaultTo('telegram').after('project_id');
            table.string('webhook_secret', 255).nullable().after('token');
            // Уникальность: один бот конкретного типа на агента в рамках проекта
            table.unique(['agent_id', 'project_id', 'bot_type'], 'idx_agent_project_bot_type');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('constructor_bots', (table) => {
            table.dropUnique(['agent_id', 'project_id', 'bot_type'], 'idx_agent_project_bot_type');
            table.dropColumn('bot_type');
        });
};
