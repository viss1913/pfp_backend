/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('users', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
            // В MySQL для изменения enum можно использовать raw или knex.schema.alterTable
            table.enum('role', ['super_admin', 'admin', 'agent']).notNullable().defaultTo('agent').alter();
        })
        .alterTable('agents', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
        })
        .alterTable('constructor_bots', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
        })
        .alterTable('clients', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
        })
        .alterTable('product_types', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
        })
        .alterTable('products', (table) => {
            table.bigInteger('project_id').unsigned().nullable().after('id')
                .references('id').inTable('projects').onDelete('SET NULL');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('products', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('product_types', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('clients', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('constructor_bots', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('agents', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('users', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
            table.enum('role', ['admin', 'agent']).notNullable().defaultTo('agent').alter();
        });
};
