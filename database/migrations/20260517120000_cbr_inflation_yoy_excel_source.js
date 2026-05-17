/**
 * ИПЦ г/г: источник ЦБ Excel UniDbQuery 132934; убрать из /latest путаницу с SOAP-годовой.
 */
exports.up = async function (knex) {
    const yoy = await knex('macro_indicators').where({ slug: 'russia_cpi_inflation_yoy' }).first();
    if (yoy) {
        await knex('macro_indicators').where({ id: yoy.id }).update({
            source: 'cbr',
            description:
                'Темп инфляции к соответствующему месяцу предыдущего года (ИПЦ, % г/г). ' +
                'Синхронизация: Excel UniDbQuery 132934 (cbr.ru/hd_base/infl). ' +
                'Для отчётов и /api/pfp/macro/latest → inflation_yoy.',
        });
    }

    await knex('macro_indicators')
        .whereIn('slug', ['cbr_inflation_weekly', 'cbr_inflation_monthly', 'cbr_inflation_annual'])
        .update({ is_active: false });
};

exports.down = async function (knex) {
    const yoy = await knex('macro_indicators').where({ slug: 'russia_cpi_inflation_yoy' }).first();
    if (yoy) {
        await knex('macro_indicators').where({ id: yoy.id }).update({
            source: 'manual',
            description:
                'Темп инфляции к соответствующему месяцу предыдущего года. Ручной ряд из scripts/data/inflation_10y.csv.',
        });
    }

    await knex('macro_indicators')
        .whereIn('slug', ['cbr_inflation_weekly', 'cbr_inflation_monthly', 'cbr_inflation_annual'])
        .update({ is_active: true });
};
