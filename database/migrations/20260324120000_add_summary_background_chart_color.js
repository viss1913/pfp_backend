/**
 * Сводная страница PDF: фон + цвет графиков (акцент секций).
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agent_report_pdf_settings', (table) => {
        table.text('summary_background_url').nullable()
            .comment('Фон страницы «Сводная информация» (URL после загрузки)');
        table.string('summary_chart_color', 16).nullable()
            .comment('Цвет графиков и акцента секций #RRGGBB');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('agent_report_pdf_settings', (table) => {
        table.dropColumn('summary_background_url');
        table.dropColumn('summary_chart_color');
    });
};
