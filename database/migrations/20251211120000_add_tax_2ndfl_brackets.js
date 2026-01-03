/**
 * Миграция для создания таблицы налоговых ставок 2НДФЛ
 * Хранит прогрессивную шкалу налогообложения с диапазонами доходов и ставками
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .createTable('tax_2ndfl_brackets', (table) => {
            table.increments('id').primary();
            table.decimal('income_from', 15, 2).notNullable().comment('Доход в год от (руб.)');
            table.decimal('income_to', 15, 2).notNullable().comment('Доход до, включая (руб.)');
            table.decimal('rate', 5, 2).notNullable().comment('Ставка налога (%)');
            table.integer('order_index').notNullable().defaultTo(0).comment('Порядок сортировки');
            table.text('description').nullable().comment('Описание диапазона');
            table.timestamps(true, true);
            
            // Индекс для быстрого поиска по диапазонам
            table.index(['income_from', 'income_to'], 'idx_income_range');
            table.index('order_index');
        })
        .then(() => {
            // Вставляем дефолтные значения (пример прогрессивной шкалы)
            // Можно будет изменить через API
            return knex('tax_2ndfl_brackets').insert([
                {
                    income_from: 0,
                    income_to: 5000000,
                    rate: 13.00,
                    order_index: 1,
                    description: 'Стандартная ставка 13%'
                }
                // Добавьте другие диапазоны по необходимости
            ]);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('tax_2ndfl_brackets');
};
























