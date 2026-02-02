/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('insurance_home_owners_products', table => {
        table.decimal('rate_constructive', 10, 6).defaultTo(0).after('description');
        table.decimal('rate_finish', 10, 6).defaultTo(0).after('rate_constructive');
        table.decimal('rate_property', 10, 6).defaultTo(0).after('rate_finish');
        table.decimal('rate_civil', 10, 6).defaultTo(0).after('rate_property');
    });
};

exports.down = function (knex) {
    return knex.schema.table('insurance_home_owners_products', table => {
        table.dropColumns('rate_constructive', 'rate_finish', 'rate_property', 'rate_civil');
    });
};
