/**
 * Allow subagents to invite (2 levels): agent_network.max_depth 1 → 2 where enabled.
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
        const network = settings.agent_network;
        if (!network || typeof network !== 'object' || network.enabled !== true) {
            continue;
        }
        const current = Number(network.max_depth);
        if (current !== 1) {
            continue;
        }
        network.max_depth = 2;
        await knex('projects').where({ id: row.id }).update({ settings: JSON.stringify(settings) });
    }
};

exports.down = async function (knex) {
    const rows = await knex('projects').select('id', 'settings');
    for (const row of rows) {
        const settings = parseSettings(row.settings);
        const network = settings.agent_network;
        if (!network || typeof network !== 'object' || network.enabled !== true) {
            continue;
        }
        if (Number(network.max_depth) !== 2) {
            continue;
        }
        network.max_depth = 1;
        await knex('projects').where({ id: row.id }).update({ settings: JSON.stringify(settings) });
    }
};
