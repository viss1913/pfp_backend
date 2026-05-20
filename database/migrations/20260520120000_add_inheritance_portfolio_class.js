/**
 * Цель «Наследство» (ИСЖ / накопление под передачу капитала).
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('portfolio_classes').insert([
        { id: 11, code: 'INHERITANCE', name: 'Наследство' }
    ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('portfolio_classes').where('code', 'INHERITANCE').del();
};
