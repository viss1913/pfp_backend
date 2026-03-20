/**
 * Настройки обложки PDF-отчёта на агента (фон, заголовок, цвет плашки).
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.createTable('agent_report_pdf_settings', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('agent_id').unsigned().notNullable().unique()
            .references('id').inTable('agents').onDelete('CASCADE');
        table.text('cover_background_url').nullable()
            .comment('URL или путь от корня репозитория к фону обложки');
        table.string('cover_title', 500).nullable()
            .comment('Текст в цветной плашке (дефолт в коде — персональное финансовое планирование)');
        table.string('title_band_color', 16).nullable()
            .comment('Фон плашки под заголовком, #RRGGBB');
        table.timestamps(true, true);
        table.index(['agent_id']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('agent_report_pdf_settings');
};
