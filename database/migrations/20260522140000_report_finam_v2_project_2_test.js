/**
 * Immers / test Finam project (id=2): enable Finam Report v2.
 * @param { import("knex").Knex } knex
 */
const PROJECT_ID = 2;

exports.up = async function (knex) {
    const projectRow = await knex('projects').where('id', PROJECT_ID).first();
    if (!projectRow) return;

    const exists = await knex('system_settings')
        .where({ key: 'report_finam', project_id: PROJECT_ID })
        .first();

    if (exists) {
        await knex('system_settings')
            .where({ id: exists.id })
            .update({ value: '2', value_type: 'number' });
        return;
    }

    await knex('system_settings').insert({
        key: 'report_finam',
        value: '2',
        value_type: 'number',
        description: 'Версия отчёта Финам: 1 — текущий, 2 — v2',
        category: 'report',
        project_id: PROJECT_ID,
    });
};

exports.down = async function (knex) {
    await knex('system_settings').where({ key: 'report_finam', project_id: PROJECT_ID }).del();
};
