/**
 * Пенсия: findPassiveIncomeYieldLine(..., monthsToPension) до ~240+ мес — дефолт был max 60.
 * @param { import("knex").Knex } knex
 */
const LINES_JSON = JSON.stringify([
    {
        min_term_months: 0,
        max_term_months: 360,
        min_amount: 0,
        max_amount: 1000000000000,
        yield_percent: 14.0,
    },
]);

exports.up = async function (knex) {
    const rows = await knex('system_settings').where({ key: 'passive_income_yield' });
    if (rows.length === 0) {
        await knex('system_settings').insert({
            key: 'passive_income_yield',
            value: LINES_JSON,
            value_type: 'json',
            description: 'Линии доходности пассивного дохода / выплат по пенсии',
            category: 'passive_income',
            project_id: null,
        });
        return;
    }
    for (const row of rows) {
        let lines;
        try {
            lines = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        } catch {
            lines = [];
        }
        if (!Array.isArray(lines) || lines.length === 0) {
            await knex('system_settings').where({ id: row.id }).update({ value: LINES_JSON });
            continue;
        }
        const updated = lines.map((l) => ({
            ...l,
            max_term_months: Math.max(Number(l.max_term_months) || 0, 360),
        }));
        await knex('system_settings').where({ id: row.id }).update({ value: JSON.stringify(updated) });
    }
};

exports.down = async function () {
    /* no-op: не сужаем обратно */
};
