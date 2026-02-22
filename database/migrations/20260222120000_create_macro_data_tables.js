/**
 * Миграция: Макроэкономические данные
 *
 * Создаёт 2 таблицы:
 * - macro_indicators — справочник показателей (slug, name, unit, source, frequency)
 * - macro_data       — история значений (indicator_id, value, date, raw_json)
 */

exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('macro_data');
    await knex.schema.dropTableIfExists('macro_indicators');

    // 1. Справочник показателей
    await knex.schema.createTable('macro_indicators', (table) => {
        table.increments('id').primary();
        table.string('slug', 100).notNullable().unique(); // e.g. 'cbr_inflation', 'moex_imoex'
        table.string('name', 255).notNullable();          // человекочитаемое название
        table.string('unit', 50).nullable();              // '%', 'пункты', 'б.п.'
        table.string('source', 100).nullable();           // 'cbr' | 'moex'
        table.string('frequency', 50).nullable();         // 'daily' | 'weekly' | 'decadal'
        table.text('description').nullable();
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
    });

    // 2. История значений
    await knex.schema.createTable('macro_data', (table) => {
        table.bigIncrements('id').primary();
        table.integer('indicator_id').unsigned().notNullable()
            .references('id').inTable('macro_indicators').onDelete('CASCADE');
        table.decimal('value', 18, 6).nullable();         // числовое значение
        table.date('date').notNullable();                  // дата наблюдения
        table.json('raw_json').nullable();                 // оригинальный ответ API
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.unique(['indicator_id', 'date']);            // один показатель = одно значение в день
        table.index(['indicator_id', 'date']);
    });

    // Заполняем справочник показателей
    await knex('macro_indicators').insert([
        {
            slug: 'cbr_inflation_weekly',
            name: 'Еженедельная инфляция (ЦБ РФ)',
            unit: '%',
            source: 'cbr',
            frequency: 'weekly',
            description: 'Еженедельный прирост ИПЦ по данным Банка России'
        },
        {
            slug: 'cbr_deposit_rate_max',
            name: 'Макс. ставка по вкладам в топ-10 банках (ЦБ РФ)',
            unit: '% годовых',
            source: 'cbr',
            frequency: 'decadal',
            description: 'Максимальная процентная ставка (декадный мониторинг ЦБ)'
        },
        {
            slug: 'moex_imoex',
            name: 'Индекс МосБиржи (IMOEX)',
            unit: 'пункты',
            source: 'moex',
            frequency: 'daily',
            description: 'Закрытие дня индекса московской биржи IMOEX'
        },
        {
            slug: 'moex_ofz_gcurve_2y',
            name: 'Доходность ОФЗ G-кривая 2 года',
            unit: '% годовых',
            source: 'moex',
            frequency: 'daily',
            description: 'Значение G-кривой ЦБ на сроке 2 года'
        },
        {
            slug: 'moex_ofz_gcurve_5y',
            name: 'Доходность ОФЗ G-кривая 5 лет',
            unit: '% годовых',
            source: 'moex',
            frequency: 'daily',
            description: 'Значение G-кривой ЦБ на сроке 5 лет'
        },
        {
            slug: 'moex_ofz_gcurve_10y',
            name: 'Доходность ОФЗ G-кривая 10 лет',
            unit: '% годовых',
            source: 'moex',
            frequency: 'daily',
            description: 'Значение G-кривой ЦБ на сроке 10 лет'
        },
        {
            slug: 'moex_rucbicp',
            name: 'Индекс корпоративных облигаций (RUCBICP)',
            unit: 'пункты',
            source: 'moex',
            frequency: 'daily',
            description: 'Полная доходность индекса корпоративных облигаций МосБиржи'
        }
    ]);
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('macro_data');
    await knex.schema.dropTableIfExists('macro_indicators');
};
