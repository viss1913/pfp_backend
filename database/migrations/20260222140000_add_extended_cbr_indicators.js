/**
 * Миграция: Добавить новые макроиндикаторы (Золото, Валюта, Разные виды инфляции)
 */
exports.up = async function (knex) {
    const indicators = [
        {
            slug: 'cbr_gold_price',
            name: 'Цена золота (ЦБ РФ)',
            unit: 'руб/грамм',
            source: 'cbr',
            frequency: 'daily',
            description: 'Учетная цена на золото, установленная Банком России'
        },
        {
            slug: 'usd_rub',
            name: 'Курс USD/RUB (ЦБ РФ)',
            unit: 'руб',
            source: 'cbr',
            frequency: 'daily',
            description: 'Официальный курс доллара США к рублю'
        },
        {
            slug: 'eur_rub',
            name: 'Курс EUR/RUB (ЦБ РФ)',
            unit: 'руб',
            source: 'cbr',
            frequency: 'daily',
            description: 'Официальный курс евро к рублю'
        },
        {
            slug: 'cbr_inflation_annual',
            name: 'Годовая инфляция (ЦБ РФ)',
            unit: '%',
            source: 'cbr',
            frequency: 'monthly',
            description: 'Инфляция в годовом исчислении'
        },
        {
            slug: 'cbr_inflation_monthly',
            name: 'Месячная инфляция (ЦБ РФ)',
            unit: '%',
            source: 'cbr',
            frequency: 'monthly',
            description: 'Инфляция за месяц к предыдущему месяцу'
        }
    ];

    for (const ind of indicators) {
        const existing = await knex('macro_indicators').where({ slug: ind.slug }).first();
        if (!existing) {
            await knex('macro_indicators').insert(ind);
        }
    }

    // Обновляем описание существующей cbr_inflation_weekly, если она была случайно названа еженедельной но содержала годовые данные
    await knex('macro_indicators')
        .where({ slug: 'cbr_inflation_weekly' })
        .update({ 
            name: 'Недельная инфляция (ЦБ РФ)',
            description: 'Инфляция за неделю (ИПЦ)'
        });
};

exports.down = async function (knex) {
    const slugs = ['cbr_gold_price', 'usd_rub', 'eur_rub', 'cbr_inflation_annual', 'cbr_inflation_monthly'];
    
    // Получаем ID индикаторов для удаления данных
    const ids = await knex('macro_indicators').whereIn('slug', slugs).pluck('id');
    
    await knex('macro_data').whereIn('indicator_id', ids).del();
    await knex('macro_indicators').whereIn('slug', slugs).del();
};
