/**
 * Add per-stage command context for AI B2C.
 *
 * В каждой стадии будет два текста:
 * - content               -> рабочий контекст для 2-го ИИ (ответ пользователю)
 * - command_context_text  -> отдельный контекст для 1-го ИИ (выбор команды)
 */
exports.up = async function (knex) {
    const addColumnIfNeeded = async (tableName) => {
        const hasTable = await knex.schema.hasTable(tableName);
        if (!hasTable) return;

        const hasColumn = await knex.schema.hasColumn(tableName, 'command_context_text');
        if (hasColumn) return;

        await knex.schema.alterTable(tableName, (table) => {
            table.text('command_context_text').nullable().after('content');
        });
    };

    await addColumnIfNeeded('ai_b2c_stage_contexts');
    await addColumnIfNeeded('ai_b2c_chat_stage_contexts');
};

exports.down = async function (knex) {
    const dropColumnIfNeeded = async (tableName) => {
        const hasTable = await knex.schema.hasTable(tableName);
        if (!hasTable) return;

        const hasColumn = await knex.schema.hasColumn(tableName, 'command_context_text');
        if (!hasColumn) return;

        await knex.schema.alterTable(tableName, (table) => {
            table.dropColumn('command_context_text');
        });
    };

    await dropColumnIfNeeded('ai_b2c_stage_contexts');
    await dropColumnIfNeeded('ai_b2c_chat_stage_contexts');
};

