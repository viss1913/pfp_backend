/**
 * ATB tenant (project_id 3): включаем Finam Report v2 через project-scoped report_finam = 2.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const ATB_PROJECT_ID = 3;

exports.up = async function (knex) {
    const projectRow = await knex('projects').where('id', ATB_PROJECT_ID).first();
    if (!projectRow) return;

    const exists = await knex('system_settings')
        .where({ key: 'report_finam', project_id: ATB_PROJECT_ID })
        .first();
    if (exists) return;

    await knex('system_settings').insert({
        key: 'report_finam',
        value: '2',
        value_type: 'number',
        description: 'Версия отчёта Финам: 1 — текущий, 2 — v2 (ATB white-label)',
        category: 'report',
        project_id: ATB_PROJECT_ID,
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex('system_settings')
        .where({ key: 'report_finam', project_id: ATB_PROJECT_ID, value: '2' })
        .del();
};
