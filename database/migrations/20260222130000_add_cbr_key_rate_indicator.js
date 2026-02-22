/**
 * Миграция: Добавить индикатор ключевой ставки ЦБР
 */
exports.up = async function (knex) {
    // Проверяем, не существует ли уже
    const existing = await knex('macro_indicators').where({ slug: 'cbr_key_rate' }).first();
    if (!existing) {
        await knex('macro_indicators').insert({
            slug: 'cbr_key_rate',
            name: 'Ключевая ставка ЦБ РФ',
            unit: '% годовых',
            source: 'cbr',
            frequency: 'daily',
            description: 'Действующая ключевая ставка Банка России (SOAP DailyInfo)'
        });
    }
};

exports.down = async function (knex) {
    const indicator = await knex('macro_indicators').where({ slug: 'cbr_key_rate' }).first();
    if (indicator) {
        await knex('macro_data').where({ indicator_id: indicator.id }).del();
        await knex('macro_indicators').where({ id: indicator.id }).del();
    }
};
