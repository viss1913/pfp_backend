/**
 * Resolut PFP: optional product catalog fields for quote-driven portfolio yield (AV project only).
 */
exports.up = function (knex) {
    return knex.schema.alterTable('products', (table) => {
        table.string('resolut_pfp_code', 64).nullable().comment('PFP code from Resolut products(), e.g. assetShort');
        table.integer('resolut_quote_p_type').unsigned().nullable().comment('Quote payment type 0/1/2/4/12; null = env or 0');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('products', (table) => {
        table.dropColumn('resolut_pfp_code');
        table.dropColumn('resolut_quote_p_type');
    });
};
