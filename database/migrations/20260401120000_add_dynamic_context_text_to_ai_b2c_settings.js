/**
 * Add dynamic context text field to AI B2C settings
 */
exports.up = async function (knex) {
    const tableName = 'ai_b2c_settings';
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;

    const hasColumn = await knex.schema.hasColumn(tableName, 'dynamic_context_text');
    if (hasColumn) return;

    await knex.schema.alterTable(tableName, (table) => {
        table.text('dynamic_context_text').nullable().after('tagline');
    });
};

exports.down = async function (knex) {
    const tableName = 'ai_b2c_settings';
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;

    const hasColumn = await knex.schema.hasColumn(tableName, 'dynamic_context_text');
    if (!hasColumn) return;

    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('dynamic_context_text');
    });
};
