/**
 * SBER tenant (project_id 29): Finam Report v2 + partner_link_tracking для демо.
 * Проект создаётся вручную в `projects` (name SBER). Миграция — settings и report_finam.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const SBER_PROJECT_ID = 29;

const DEFAULT_SBER_PROJECT_SETTINGS = {
    partner_agent_id: {
        label: 'ID Сбер',
        require_on_registration: false,
        require_on_admin_create: false,
        ref_parse: {
            query_params: ['agent_id', 'agentId', 'consultant_id', 'id'],
            path_regex: null,
        },
    },
    partner_link_tracking: {
        enabled: true,
        domain_whitelist: [
            'npfsberbanka.ru',
            'sberbank-insurance.ru',
            'first-am.ru',
            'sberbank.ru',
            'sberbank.com',
        ],
        defaults: { utm_source: 'pfp', utm_medium: 'report_pdf' },
        per_link_type: {
            npf: { utm_campaign: 'npf_sber' },
            life: { utm_campaign: 'life_podushka' },
            uk_funds: { utm_campaign: 'uk_pervaya' },
            broker_open: { utm_campaign: 'broker_investments' },
            generic: { utm_campaign: 'sber_partner' },
        },
        agent_id_param: 'agent_id',
        agent_id_in: 'query',
    },
};

exports.up = async function (knex) {
    const projectRow = await knex('projects').where('id', SBER_PROJECT_ID).first();
    if (!projectRow) return;

    const existsReport = await knex('system_settings')
        .where({ key: 'report_finam', project_id: SBER_PROJECT_ID })
        .first();
    if (!existsReport) {
        await knex('system_settings').insert({
            key: 'report_finam',
            value: '2',
            value_type: 'number',
            description: 'Версия отчёта Финам: 1 — текущий, 2 — v2 (SBER white-label)',
            category: 'report',
            project_id: SBER_PROJECT_ID,
        });
    }

    let settings = {};
    try {
        settings =
            projectRow.settings && typeof projectRow.settings === 'object'
                ? { ...projectRow.settings }
                : JSON.parse(String(projectRow.settings || '{}'));
    } catch (_) {
        settings = {};
    }

    const merged = { ...settings, ...DEFAULT_SBER_PROJECT_SETTINGS };
    await knex('projects').where('id', SBER_PROJECT_ID).update({
        settings: JSON.stringify(merged),
        updated_at: knex.fn.now(),
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex('system_settings').where({ key: 'report_finam', project_id: SBER_PROJECT_ID }).del();

    const projectRow = await knex('projects').where('id', SBER_PROJECT_ID).first();
    if (!projectRow) return;

    let settings = {};
    try {
        settings =
            projectRow.settings && typeof projectRow.settings === 'object'
                ? { ...projectRow.settings }
                : JSON.parse(String(projectRow.settings || '{}'));
    } catch (_) {
        return;
    }

    delete settings.partner_agent_id;
    delete settings.partner_link_tracking;

    await knex('projects').where('id', SBER_PROJECT_ID).update({
        settings: JSON.stringify(settings),
        updated_at: knex.fn.now(),
    });
};
