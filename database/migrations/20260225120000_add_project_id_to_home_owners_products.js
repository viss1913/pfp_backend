/**
 * Добавляем project_id в продукты страхования имущества (Home Owners).
 * Продукты с project_id = null считаются общими для всех проектов.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('insurance_home_owners_products', (table) => {
        table.bigInteger('project_id').unsigned().nullable().after('id')
            .references('id').inTable('projects').onDelete('SET NULL');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('insurance_home_owners_products', (table) => {
        table.dropForeign(['project_id']);
        table.dropColumn('project_id');
    });
};
