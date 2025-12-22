/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('portfolio_classes').insert([
        { id: 7, code: 'FIN_RESERVE', name: 'Финрезерв' }
    ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('portfolio_classes').where('code', 'FIN_RESERVE').del();
};
