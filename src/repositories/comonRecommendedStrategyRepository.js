const db = require('../config/database');

function parsePayload(row) {
    if (!row || row.payload == null) return null;
    const p = row.payload;
    return typeof p === 'string' ? JSON.parse(p) : p;
}

class ComonRecommendedStrategyRepository {
    /**
     * Активные стратегии в порядке показа (полный объект Comon в payload).
     * @returns {Promise<object[]>}
     */
    async listActivePayloadsOrdered() {
        const rows = await db('comon_recommended_strategies')
            .where({ is_active: true })
            .orderBy('sort_order', 'asc')
            .orderBy('comon_strategy_id', 'asc')
            .select('payload');
        return rows.map(parsePayload).filter(Boolean);
    }

    /**
     * Версия кэша витрины: max(updated_at) по таблице.
     * @returns {Promise<number>}
     */
    async getMaxUpdatedAtMs() {
        const row = await db('comon_recommended_strategies').max('updated_at as m').first();
        if (!row || row.m == null) return 0;
        const t = new Date(row.m).getTime();
        return Number.isFinite(t) ? t : 0;
    }
}

module.exports = new ComonRecommendedStrategyRepository();
