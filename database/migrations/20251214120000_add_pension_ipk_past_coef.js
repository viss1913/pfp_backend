/**
 * Добавление настройки pension_ipk_past_coef (коэффициент для оценки ИПК за прошлые годы)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex('system_settings').insert({
        key: 'pension_ipk_past_coef',
        value: '0.60',
        value_type: 'number',
        description: 'Коэффициент для оценки среднего ИПК за прошлые годы (0.6 = 60% от текущего)',
        category: 'pension'
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
        .where('key', 'pension_ipk_past_coef')
        .del();
};

