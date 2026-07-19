/**
 * Content Factory: number of A4 pages in one HTML document (IDE page_count).
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('content_offers', 'page_count');
    if (!hasColumn) {
        await knex.schema.alterTable('content_offers', (table) => {
            table.integer('page_count').unsigned().notNullable().defaultTo(1);
        });
    }
};

exports.down = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('content_offers', 'page_count');
    if (hasColumn) {
        await knex.schema.alterTable('content_offers', (table) => {
            table.dropColumn('page_count');
        });
    }
};
