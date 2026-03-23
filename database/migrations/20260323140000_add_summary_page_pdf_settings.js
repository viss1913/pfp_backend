/**
 * Вторая страница PDF («Сводная информация»): брендинг в ЛК агента.
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agent_report_pdf_settings', (table) => {
        table.text('summary_logo_url').nullable()
            .comment('URL логотипа на странице «Сводная информация»');
        table.string('summary_accent_color', 16).nullable()
            .comment('Акцент заголовков секций #RRGGBB');
        table.text('summary_ai_avatar_url').nullable()
            .comment('URL аватара блока ИИ на сводной странице');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('agent_report_pdf_settings', (table) => {
        table.dropColumn('summary_logo_url');
        table.dropColumn('summary_accent_color');
        table.dropColumn('summary_ai_avatar_url');
    });
};
