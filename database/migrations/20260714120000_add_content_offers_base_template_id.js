/**
 * Content Factory: store selected base HTML template per offer.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('content_offers', 'base_template_id');
    if (!hasColumn) {
        await knex.schema.alterTable('content_offers', (table) => {
            table.string('base_template_id', 64).nullable().defaultTo('finam-a4-portrait-light');
        });
    }
};

exports.down = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('content_offers', 'base_template_id');
    if (hasColumn) {
        await knex.schema.alterTable('content_offers', (table) => {
            table.dropColumn('base_template_id');
        });
    }
};
