/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('system_settings', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('CASCADE');
        })
        .alterTable('portfolio_classes', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('CASCADE');
        })
        .alterTable('tax_2ndfl_brackets', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('CASCADE');
        })
        .alterTable('pds_settings', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('CASCADE');
        })
        .alterTable('pds_cofin_income_brackets', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('CASCADE');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('pds_cofin_income_brackets', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('pds_settings', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('tax_2ndfl_brackets', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('portfolio_classes', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('system_settings', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        });
};
