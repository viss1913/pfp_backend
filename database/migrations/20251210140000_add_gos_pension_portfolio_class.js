/**
 * Добавление нового класса портфеля GOS_PENSION (Госпенсия)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('portfolio_classes').insert({
        id: 6,
        code: 'GOS_PENSION',
        name: 'Госпенсия'
    }).catch((err) => {
        // Игнорируем ошибку, если класс уже существует
        if (err.code !== 'ER_DUP_ENTRY' && !err.message.includes('Duplicate entry')) {
            throw err;
        }
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex('portfolio_classes')
        .where('code', 'GOS_PENSION')
        .del();
};



