/**
 * Finam (project 14): allow agent registration without partner_agent_id at step 1
 * (Finam ID can be collected on frontend after email verify).
 *
 * @param { import("knex").Knex } knex
 */
const FINAM_PROJECT_ID = 14;

exports.up = async function (knex) {
    const finamProject = await knex('projects').where('id', FINAM_PROJECT_ID).first();
    if (!finamProject) return;

    let settings = {};
    try {
        settings =
            typeof finamProject.settings === 'string'
                ? JSON.parse(finamProject.settings || '{}')
                : finamProject.settings || {};
    } catch (_) {
        settings = {};
    }

    const partnerCfg =
        settings.partner_agent_id && typeof settings.partner_agent_id === 'object'
            ? { ...settings.partner_agent_id }
            : {};

    partnerCfg.require_on_registration = false;
    partnerCfg.require_for_full_access = true;

    await knex('projects')
        .where('id', FINAM_PROJECT_ID)
        .update({
            settings: JSON.stringify({
                ...settings,
                partner_agent_id: partnerCfg,
            }),
            updated_at: knex.fn.now(),
        });
};

exports.down = async function (knex) {
    const finamProject = await knex('projects').where('id', FINAM_PROJECT_ID).first();
    if (!finamProject) return;

    let settings = {};
    try {
        settings =
            typeof finamProject.settings === 'string'
                ? JSON.parse(finamProject.settings || '{}')
                : finamProject.settings || {};
    } catch (_) {
        settings = {};
    }

    const partnerCfg =
        settings.partner_agent_id && typeof settings.partner_agent_id === 'object'
            ? { ...settings.partner_agent_id }
            : {};

    partnerCfg.require_on_registration = true;
    delete partnerCfg.require_for_full_access;

    await knex('projects')
        .where('id', FINAM_PROJECT_ID)
        .update({
            settings: JSON.stringify({
                ...settings,
                partner_agent_id: partnerCfg,
            }),
            updated_at: knex.fn.now(),
        });
};
