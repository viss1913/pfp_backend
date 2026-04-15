exports.up = function (knex) {
    return knex.schema.table('clients', (table) => {
        table.string('report_pdf_status', 32).nullable().index();
        table.text('report_pdf_url').nullable();
        table.timestamp('report_pdf_generated_at').nullable();
        table.timestamp('report_pdf_updated_at').nullable();
        table.text('report_pdf_error').nullable();
    });
};

exports.down = function (knex) {
    return knex.schema.table('clients', (table) => {
        table.dropColumn('report_pdf_status');
        table.dropColumn('report_pdf_url');
        table.dropColumn('report_pdf_generated_at');
        table.dropColumn('report_pdf_updated_at');
        table.dropColumn('report_pdf_error');
    });
};
