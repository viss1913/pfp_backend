/**
 * Finam partner links: utm_partner_finam instead of legacy agent_id query param.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
function parseSettings(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(String(raw));
    } catch (_) {
        return {};
    }
}

exports.up = async function (knex) {
    const rows = await knex('projects').select('id', 'settings');
    for (const row of rows) {
        const settings = parseSettings(row.settings);
        let changed = false;

        const tracking = settings.partner_link_tracking;
        if (tracking && typeof tracking === 'object') {
            if (!tracking.agent_id_param || tracking.agent_id_param === 'agent_id') {
                tracking.agent_id_param = 'utm_partner_finam';
                changed = true;
            }
        }

        const partnerCfg = settings.partner_agent_id;
        if (partnerCfg && typeof partnerCfg === 'object') {
            const refParse =
                partnerCfg.ref_parse && typeof partnerCfg.ref_parse === 'object'
                    ? partnerCfg.ref_parse
                    : {};
            const params = Array.isArray(refParse.query_params) ? [...refParse.query_params] : [];
            if (!params.includes('utm_partner_finam')) {
                refParse.query_params = [
                    'utm_partner_finam',
                    ...params.filter((k) => k !== 'utm_partner_finam'),
                ];
                partnerCfg.ref_parse = refParse;
                changed = true;
            }
        }

        if (changed) {
            await knex('projects').where({ id: row.id }).update({ settings: JSON.stringify(settings) });
        }
    }
};

exports.down = async function () {
    /* no-op: keep utm_partner_finam on rollback */
};
