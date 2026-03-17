/**
 * Миграция: Настройки внешнего вида AI B2C ассистента
 *
 * Храним на уровне проекта:
 * - display_name   — имя ассистента ("Виктория")
 * - avatar_url     — урл на аватар
 * - tagline        — короткое зелёное описание/подпись
 */

exports.up = async function (knex) {
    const tableName = 'ai_b2c_settings';

    const exists = await knex.schema.hasTable(tableName);
    if (exists) return;

    await knex.schema.createTable(tableName, (table) => {
        table.increments('id').primary();
        table.bigInteger('project_id').unsigned().notNullable().unique();
        table.string('display_name', 255).notNullable().defaultTo('AI-ассистент');
        table.string('avatar_url', 1024).nullable();
        table.string('tagline', 512).nullable();
        table.timestamps(true, true);

        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('ai_b2c_settings');
};

