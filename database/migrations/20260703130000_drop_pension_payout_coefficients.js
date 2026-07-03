/**
 * Коэффициенты перенесены в матрицу passive_income_yield (пол + возраст в lines).
 */
exports.up = function (knex) {
    return knex.schema.dropTableIfExists('pension_payout_coefficients');
};

exports.down = function () {
    return Promise.resolve();
};
