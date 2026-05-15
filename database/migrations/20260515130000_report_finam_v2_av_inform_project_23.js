/**
 * Finam Report v2 для AV Информ (project 23): project-scoped `report_finam = 2`.
 * Пайплайн шаблонов уже в FINAM_REPORT_PROJECT_IDS (finamTemplateProjects); здесь только версия отчёта.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const AV_INFORM_PROJECT_ID = 23;

exports.up = async function (knex) {
    const projectRow = await knex('projects').where('id', AV_INFORM_PROJECT_ID).first();
    if (!projectRow) return;

    const exists = await knex('system_settings')
        .where({ key: 'report_finam', project_id: AV_INFORM_PROJECT_ID })
        .first();
    if (exists) return;

    await knex('system_settings').insert({
        key: 'report_finam',
        value: '2',
        value_type: 'number',
        description: 'Версия отчёта Финам: 1 — текущий, 2 — v2 (AV Информ / Resolut)',
        category: 'report',
        project_id: AV_INFORM_PROJECT_ID,
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex('system_settings')
        .where({ key: 'report_finam', project_id: AV_INFORM_PROJECT_ID, value: '2' })
        .del();
};
