/**
 * Finam (project 14): agent landing URL in partner_agent_id settings + UTM campaign for agent_register.
 *
 * @param { import("knex").Knex } knex
 */
const FINAM_PROJECT_ID = 14;
const DEFAULT_FINAM_AGENT_LANDING = 'https://broker.finam.ru/landing/agent/';

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
    partnerCfg.finam_agent_landing_url = DEFAULT_FINAM_AGENT_LANDING;

    const tracking =
        settings.partner_link_tracking && typeof settings.partner_link_tracking === 'object'
            ? { ...settings.partner_link_tracking }
            : {};
    const perType =
        tracking.per_link_type && typeof tracking.per_link_type === 'object'
            ? { ...tracking.per_link_type }
            : {};
    perType.agent_register = { utm_campaign: 'agent_landing' };
    tracking.per_link_type = perType;

    await knex('projects')
        .where('id', FINAM_PROJECT_ID)
        .update({
            settings: JSON.stringify({
                ...settings,
                partner_agent_id: partnerCfg,
                partner_link_tracking: tracking,
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
    delete partnerCfg.finam_agent_landing_url;

    const tracking =
        settings.partner_link_tracking && typeof settings.partner_link_tracking === 'object'
            ? { ...settings.partner_link_tracking }
            : {};
    if (tracking.per_link_type && typeof tracking.per_link_type === 'object') {
        const perType = { ...tracking.per_link_type };
        delete perType.agent_register;
        tracking.per_link_type = perType;
    }

    await knex('projects')
        .where('id', FINAM_PROJECT_ID)
        .update({
            settings: JSON.stringify({
                ...settings,
                partner_agent_id: partnerCfg,
                partner_link_tracking: tracking,
            }),
            updated_at: knex.fn.now(),
        });
};
