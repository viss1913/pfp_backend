/**
 * In-memory кэш Bearer-ключа Резолюта после authorize (например при логине агента).
 * Несколько инстансов — позже Redis; для одного процесса достаточно Map.
 */
const store = new Map();

const DEFAULT_TTL_MS = Number(process.env.RESOLUT_SESSION_TTL_MS || 23 * 60 * 60 * 1000);

function set(userId, key, ttlMs = DEFAULT_TTL_MS) {
    if (userId == null || !key) return;
    const id = Number(userId);
    if (!Number.isFinite(id)) return;
    store.set(id, { key: String(key), expiresAt: Date.now() + ttlMs });
}

function get(userId) {
    if (userId == null) return null;
    const id = Number(userId);
    if (!Number.isFinite(id)) return null;
    const row = store.get(id);
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
        store.delete(id);
        return null;
    }
    return row.key;
}

function clear(userId) {
    if (userId == null) return;
    const id = Number(userId);
    if (Number.isFinite(id)) store.delete(id);
}

module.exports = {
    set,
    get,
    clear,
};
