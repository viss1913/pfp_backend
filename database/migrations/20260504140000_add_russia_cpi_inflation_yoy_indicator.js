exports.up = async function (knex) {
    const slug = 'russia_cpi_inflation_yoy';
    const existing = await knex('macro_indicators').where({ slug }).first();
    if (existing) return;

    await knex('macro_indicators').insert({
        slug,
        name: 'ИПЦ, прирост г/г (Россия)',
        unit: '%',
        source: 'manual',
        frequency: 'monthly',
        description:
            'Темп инфляции к соответствующему месяцу предыдущего года. Ручной ряд из scripts/data/inflation_10y.csv; не смешивать с rosstat_inflation_monthly (м/м).'
    });
};

exports.down = async function (knex) {
    const slug = 'russia_cpi_inflation_yoy';
    const indicator = await knex('macro_indicators').where({ slug }).first();
    if (!indicator) return;
    await knex('macro_data').where({ indicator_id: indicator.id }).del();
    await knex('macro_indicators').where({ id: indicator.id }).del();
};
