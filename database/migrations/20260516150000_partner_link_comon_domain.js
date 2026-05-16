/**
 * Comon (comon.ru) in partner_link_tracking whitelist + utm_campaign comon_autofollow.
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
        const tracking = settings.partner_link_tracking;
        if (!tracking || typeof tracking !== 'object') continue;

        let changed = false;
        const list = Array.isArray(tracking.domain_whitelist) ? [...tracking.domain_whitelist] : [];
        if (!list.includes('comon.ru')) {
            tracking.domain_whitelist = [...list, 'comon.ru'];
            changed = true;
        }

        const perType =
            tracking.per_link_type && typeof tracking.per_link_type === 'object'
                ? { ...tracking.per_link_type }
                : {};
        if (!perType.comon) {
            perType.comon = { utm_campaign: 'comon_autofollow' };
            tracking.per_link_type = perType;
            changed = true;
        }

        if (changed) {
            await knex('projects').where({ id: row.id }).update({ settings: JSON.stringify(settings) });
        }
    }
};

exports.down = async function () {
    /* no-op */
};
