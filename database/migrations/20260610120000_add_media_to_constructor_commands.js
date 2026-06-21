/**
 * Медиа (картинки/видео) к стадиям CJM конструктора.
 *
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
    const hasColumn = await knex.schema.hasColumn('constructor_commands', 'media');
    if (!hasColumn) {
        await knex.schema.alterTable('constructor_commands', (table) => {
            table.json('media').nullable().comment('Массив {id,type,url,key,caption,sort}');
        });
    }
};

exports.down = async function down(knex) {
    const hasColumn = await knex.schema.hasColumn('constructor_commands', 'media');
    if (hasColumn) {
        await knex.schema.alterTable('constructor_commands', (table) => {
            table.dropColumn('media');
        });
    }
};
