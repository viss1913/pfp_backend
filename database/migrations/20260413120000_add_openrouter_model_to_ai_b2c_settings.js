/**
 * OpenRouter model id для отчётов / кастомных вызовов (например лид страницы 2 Финам).
 * Если null — используются OPENROUTER_MODEL_* из env.
 */
exports.up = async function (knex) {
    const tableName = 'ai_b2c_settings';
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;

    const hasColumn = await knex.schema.hasColumn(tableName, 'openrouter_model');
    if (hasColumn) return;

    await knex.schema.alterTable(tableName, (table) => {
        table.string('openrouter_model', 255).nullable().after('dynamic_context_text');
    });
};

exports.down = async function (knex) {
    const tableName = 'ai_b2c_settings';
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;

    const hasColumn = await knex.schema.hasColumn(tableName, 'openrouter_model');
    if (!hasColumn) return;

    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('openrouter_model');
    });
};
