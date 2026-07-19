/**
 * Content Factory HTML with inlined images exceeds MySQL TEXT (64KB).
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('content_offers', (table) => {
        table.text('generated_html', 'longtext').alter();
    });
    await knex.schema.alterTable('agent_presentations', (table) => {
        table.text('pdf_html_snapshot', 'longtext').alter();
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('content_offers', (table) => {
        table.text('generated_html').alter();
    });
    await knex.schema.alterTable('agent_presentations', (table) => {
        table.text('pdf_html_snapshot').alter();
    });
};
