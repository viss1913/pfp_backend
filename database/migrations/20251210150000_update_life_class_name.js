/**
 * Обновление названия класса LIFE с "Защита жизни" на "Жизнь"
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('portfolio_classes')
        .where('code', 'LIFE')
        .update({
            name: 'Жизнь'
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('portfolio_classes')
        .where('code', 'LIFE')
        .update({
            name: 'Защита жизни'
        });
};

