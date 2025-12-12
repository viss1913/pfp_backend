/**
 * Миграция для создания таблиц софинансирования ПДС
 * - pds_settings: глобальные параметры софинансирования
 * - pds_cofin_income_brackets: шкала коэффициентов по доходу
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // Таблица общих настроек ПДС
        .createTable('pds_settings', (table) => {
            table.increments('id').primary();
            table.integer('max_state_cofin_amount_per_year').notNullable().defaultTo(36000)
                .comment('Максимальная сумма господдержки в год (₽)');
            table.integer('min_contribution_for_support_per_year').notNullable().defaultTo(2000)
                .comment('Минимальный годовой взнос для участия в софинансировании (₽)');
            table.enu('income_basis', ['gross_before_ndfl', 'net_after_ndfl'])
                .notNullable().defaultTo('gross_before_ndfl')
                .comment('Основа для расчета дохода: gross_before_ndfl - до НДФЛ, net_after_ndfl - после НДФЛ');
            table.timestamps(true, true);
        })
        // Таблица шкалы софинансирования по доходу
        .createTable('pds_cofin_income_brackets', (table) => {
            table.increments('id').primary();
            table.integer('income_from').notNullable()
                .comment('Доход от (₽/мес), включительно');
            table.integer('income_to').nullable()
                .comment('Доход до (₽/мес), NULL = нет верхней границы');
            table.integer('ratio_numerator').notNullable()
                .comment('Числитель соотношения (обычно 1)');
            table.integer('ratio_denominator').notNullable()
                .comment('Знаменатель соотношения (1, 2, 4)');
            table.timestamps(true, true);
            
            // Индекс для быстрого поиска по диапазонам
            table.index(['income_from', 'income_to'], 'idx_pds_income_range');
        })
        .then(() => {
            // Вставляем дефолтные настройки (одна запись)
            return knex('pds_settings').insert({
                max_state_cofin_amount_per_year: 36000,
                min_contribution_for_support_per_year: 2000,
                income_basis: 'gross_before_ndfl'
            });
        })
        .then(() => {
            // Вставляем стартовый набор шкалы доходов
            return knex('pds_cofin_income_brackets').insert([
                {
                    income_from: 0,
                    income_to: 80000,
                    ratio_numerator: 1,
                    ratio_denominator: 1
                },
                {
                    income_from: 80001,
                    income_to: 150000,
                    ratio_numerator: 1,
                    ratio_denominator: 2
                },
                {
                    income_from: 150001,
                    income_to: null, // NULL = нет верхней границы
                    ratio_numerator: 1,
                    ratio_denominator: 4
                }
            ]);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('pds_cofin_income_brackets')
        .dropTableIfExists('pds_settings');
};

