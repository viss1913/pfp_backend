const knex = require('../config/database');

function turnsToMessageRows(logRows) {
    const out = [];
    for (const row of logRows) {
        const baseTime = row.created_at;
        const uid = Number(row.id) * 1000;
        out.push({
            id: uid + 1,
            stage_key: 'constructor',
            role: 'user',
            content: row.input_text || '',
            created_at: baseTime,
        });
        out.push({
            id: uid + 2,
            stage_key: 'constructor',
            role: 'assistant',
            content: row.response_generated || '',
            created_at: baseTime,
        });
    }
    return out;
}

/**
 * История чата конструктора (site-chat/stream): `constructor_logs` → по связи `constructor_clients.pfp_client_id`.
 * @param {number} maxTurns макс. число «ходов» (пар user+assistant); в ответе до 2*maxTurns сообщений.
 */
async function listConstructorSiteChatMessagesForPfpClient(pfpClientId, maxTurns = 250) {
    const lim = Math.min(Math.max(Number(maxTurns) || 250, 1), 2000);
    const rows = await knex('constructor_logs as cl')
        .join('constructor_sessions as cs', 'cs.id', 'cl.session_id')
        .join('constructor_clients as cc', 'cc.id', 'cs.client_id')
        .where('cc.pfp_client_id', pfpClientId)
        .orderBy('cl.created_at', 'desc')
        .orderBy('cl.id', 'desc')
        .limit(lim)
        .select('cl.id', 'cl.input_text', 'cl.response_generated', 'cl.created_at');

    return turnsToMessageRows(rows.reverse());
}

/**
 * @returns {Map<number, Array>}
 */
async function listConstructorSiteChatMessagesForPfpClients(pfpClientIds, maxTurns = 100) {
    const map = new Map();
    if (!pfpClientIds?.length) return map;

    const uniqueIds = [...new Set(pfpClientIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!uniqueIds.length) return map;

    const lim = Math.min(Math.max(Number(maxTurns) || 100, 1), 500);
    const placeholders = uniqueIds.map(() => '?').join(',');
    const sql = `
        SELECT id, input_text, response_generated, created_at, pfp_client_id
        FROM (
            SELECT cl.id, cl.input_text, cl.response_generated, cl.created_at, cc.pfp_client_id,
                ROW_NUMBER() OVER (
                    PARTITION BY cc.pfp_client_id
                    ORDER BY cl.created_at DESC, cl.id DESC
                ) AS rn
            FROM constructor_logs cl
            INNER JOIN constructor_sessions cs ON cs.id = cl.session_id
            INNER JOIN constructor_clients cc ON cc.id = cs.client_id
            WHERE cc.pfp_client_id IN (${placeholders})
        ) x
        WHERE x.rn <= ?
        ORDER BY x.pfp_client_id ASC, x.created_at ASC, x.id ASC
    `;
    const bindings = [...uniqueIds, lim];
    const result = await knex.raw(sql, bindings);
    const rows = result && result[0] ? result[0] : [];

    const byClient = new Map();
    for (const row of rows) {
        const cid = Number(row.pfp_client_id);
        if (!byClient.has(cid)) byClient.set(cid, []);
        byClient.get(cid).push({
            id: row.id,
            input_text: row.input_text,
            response_generated: row.response_generated,
            created_at: row.created_at,
        });
    }
    for (const [cid, logRows] of byClient.entries()) {
        map.set(cid, turnsToMessageRows(logRows));
    }
    return map;
}

module.exports = {
    listConstructorSiteChatMessagesForPfpClient,
    listConstructorSiteChatMessagesForPfpClients,
};
