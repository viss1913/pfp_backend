/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // 1. Добавляем project_id в constructor_brain_contexts
    await knex.schema.alterTable('constructor_brain_contexts', (table) => {
        table.bigInteger('project_id').unsigned().nullable().after('id')
            .references('id').inTable('projects').onDelete('CASCADE');
    });

    // 2. Добавляем project_id в constructor_commands
    await knex.schema.alterTable('constructor_commands', (table) => {
        table.bigInteger('project_id').unsigned().nullable().after('bot_id')
            .references('id').inTable('projects').onDelete('CASCADE');
    });

    // 3. Пытаемся привязать существующие данные к проекту #1 (обычно дефолтный)
    // Это временная мера, чтобы данные не пропали из виду
    const defaultProject = await knex('projects').first();
    if (defaultProject) {
        await knex('constructor_brain_contexts').update({ project_id: defaultProject.id });
        await knex('constructor_commands').where('is_template', true).update({ project_id: defaultProject.id });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .alterTable('constructor_commands', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        })
        .alterTable('constructor_brain_contexts', (table) => {
            table.dropForeign(['project_id']);
            table.dropColumn('project_id');
        });
};
