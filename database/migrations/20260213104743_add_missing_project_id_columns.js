/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('portfolios', 'project_id');
    if (!hasColumn) {
        return knex.schema.alterTable('portfolios', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('portfolios', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        });
};
