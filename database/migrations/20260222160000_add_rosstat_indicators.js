exports.up = async function (knex) {
    const indicators = [
        {
            slug: 'rosstat_inflation_monthly',
            name: 'Инфляция (месячная, Росстат)',
            unit: '%',
            source: 'rosstat',
            frequency: 'monthly',
            description: 'Индекс потребительских цен к предыдущему месяцу'
        },
        {
            slug: 'rosstat_inflation_weekly',
            name: 'Инфляция (недельная, Росстат)',
            unit: '%',
            source: 'rosstat',
            frequency: 'weekly',
            description: 'Индекс потребительских цен к предыдущей неделе'
        }
    ];

    for (const ind of indicators) {
        const existing = await knex('macro_indicators').where({ slug: ind.slug }).first();
        if (!existing) {
            await knex('macro_indicators').insert(ind);
        }
    }
};

exports.down = async function (knex) {
    await knex('macro_indicators').whereIn('slug', ['rosstat_inflation_monthly', 'rosstat_inflation_weekly']).delete();
};
