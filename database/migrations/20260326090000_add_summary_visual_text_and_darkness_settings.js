/**
 * Визуальные настройки страницы «Сводная информация» и страниц целей:
 * затемнение/overlay фона, цвет текста, цвет линий/бордеров.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agent_report_pdf_settings', (table) => {
        table.integer('summary_background_darkness_percent').nullable()
            .comment('Затемнение фона (0..100) для затемняющего оверлея');
        table.decimal('summary_background_overlay_opacity', 4, 3).nullable()
            .comment('Overlay opacity фона (0..1)');

        table.string('summary_text_color', 16).nullable()
            .comment('Цвет текста на странице #RRGGBB');
        table.string('summary_line_color', 16).nullable()
            .comment('Цвет линий/бордеров #RRGGBB');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('agent_report_pdf_settings', (table) => {
        table.dropColumn('summary_background_darkness_percent');
        table.dropColumn('summary_background_overlay_opacity');
        table.dropColumn('summary_text_color');
        table.dropColumn('summary_line_color');
    });
};

