/**
 * Меняем уникальность: одна настройка на пару (key, project_id), чтобы агенты могли иметь свои значения по ключу.
 * Было: unique(key) — одна запись на ключ по всей таблице.
 * Стало: unique(key, project_id) — своя запись на ключ в рамках проекта, глобальные с project_id = null.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('system_settings', (table) => {
        table.dropUnique(['key']);
        table.unique(['key', 'project_id'], 'system_settings_key_project_unique');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('system_settings', (table) => {
        table.dropUnique(['key', 'project_id'], 'system_settings_key_project_unique');
        table.unique(['key']);
    });
};
