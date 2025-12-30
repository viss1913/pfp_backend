/**
 * Добавление настройки passive_income_yield с линиями доходности
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('system_settings').insert({
        key: 'passive_income_yield',
        value: JSON.stringify([
            {
                min_term_months: 0,
                max_term_months: 60,
                min_amount: 0,
                max_amount: 1000000000000,
                yield_percent: 14.0
            }
        ]),
        value_type: 'json',
        description: 'Линии доходности для целей типа "Пассивный доход". Формат: массив объектов с полями min_term_months, max_term_months, min_amount, max_amount, yield_percent',
        category: 'passive_income'
    }).catch((err) => {
        // Игнорируем ошибку, если настройка уже существует
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
    return knex('system_settings')
        .where('key', 'passive_income_yield')
        .del();
};
















