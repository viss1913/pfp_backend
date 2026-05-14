/**
 * Finam Report v2 по умолчанию для white-label проектов (Finam-template + `report_finam = 2`).
 * Добавляй сюда `project_id` новых тенантов на том же шаблоне, что АТБ, и прогоняй миграцию на новых стендах;
 * на уже развёрнутых БД — либо повторный `knex migrate:up` после добавления id, либо `PUT /api/pfp/settings/report_finam` { "value": 2 }.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const REPORT_FINAM_V2_WHITE_LABEL_PROJECT_IDS = [
    28, // АТБ Банк (pk_a4d68bac233593d972b3a1f0)
];

exports.up = async function (knex) {
    for (const projectId of REPORT_FINAM_V2_WHITE_LABEL_PROJECT_IDS) {
        const projectRow = await knex('projects').where('id', projectId).first();
        if (!projectRow) continue;

        const exists = await knex('system_settings')
            .where({ key: 'report_finam', project_id: projectId })
            .first();
        if (exists) continue;

        await knex('system_settings').insert({
            key: 'report_finam',
            value: '2',
            value_type: 'number',
            description: 'Версия отчёта Финам: 1 — текущий, 2 — v2 (white-label Finam-template)',
            category: 'report',
            project_id: projectId,
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex('system_settings')
        .where({ key: 'report_finam' })
        .whereIn('project_id', REPORT_FINAM_V2_WHITE_LABEL_PROJECT_IDS)
        .del();
};
