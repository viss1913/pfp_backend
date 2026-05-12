/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const exists = await knex('system_settings')
        .where({ key: 'report_finam' })
        .whereNull('project_id')
        .first();

    if (!exists) {
        await knex('system_settings').insert({
            key: 'report_finam',
            value: '1',
            value_type: 'number',
            description: 'Версия отчёта Финам: 1 — текущий, 2 — v2',
            category: 'report',
            project_id: null,
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
        .whereNull('project_id')
        .del();
};
