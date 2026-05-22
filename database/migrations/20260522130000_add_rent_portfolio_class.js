/**
 * Класс портфеля «Рента» (goal_type_id / class_id = 8).
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const existing = await knex('portfolio_classes').where('code', 'RENT').first();
    if (existing) return;

    const id8 = await knex('portfolio_classes').where('id', 8).first();
    if (id8) {
        await knex('portfolio_classes').where('id', 8).update({ code: 'RENT', name: 'Рента' });
        return;
    }

    await knex('portfolio_classes').insert({ id: 8, code: 'RENT', name: 'Рента' });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('portfolio_classes').where('code', 'RENT').del();
};
