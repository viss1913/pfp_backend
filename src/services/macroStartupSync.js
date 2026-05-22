const db = require('../config/database');
const { runCbrInflationYoySync } = require('./macroInflationSyncNotifyService');
const rosstatService = require('./rosstatService');

const INFLATION_YOY_SLUG = 'russia_cpi_inflation_yoy';
const STALE_DAYS = Number(process.env.MACRO_INFLATION_STALE_DAYS || 8);
const STARTUP_DELAY_MS = Number(process.env.MACRO_STARTUP_SYNC_DELAY_MS || 25000);

async function getInflationYoyLatestDate() {
    const indicator = await db('macro_indicators').where({ slug: INFLATION_YOY_SLUG }).first();
    if (!indicator) return null;
    const row = await db('macro_data')
        .where({ indicator_id: indicator.id })
        .orderBy('date', 'desc')
        .first('date');
    return row?.date ? new Date(row.date) : null;
}

function isStale(latestDate) {
    if (!latestDate || Number.isNaN(latestDate.getTime())) return true;
    const ageMs = Date.now() - latestDate.getTime();
    return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * После деплоя на Railway: если ИПЦ г/г в БД старше N дней — фоновый sync без shell.
 */
function scheduleStaleInflationSyncOnStartup() {
    if (process.env.MACRO_STARTUP_SYNC === '0' || process.env.MACRO_STARTUP_SYNC === 'false') {
        return;
    }

    setTimeout(async () => {
        try {
            const latest = await getInflationYoyLatestDate();
            if (!isStale(latest)) {
                console.log(
                    `[macroStartup] ИПЦ г/г актуален (последняя точка: ${latest ? latest.toISOString().slice(0, 10) : 'нет данных'})`
                );
                return;
            }
            console.log(
                `[macroStartup] ИПЦ г/г устарел (> ${STALE_DAYS} дн.), запускаем sync…`
            );
            const result = await runCbrInflationYoySync('startup:stale');
            await rosstatService.fetchWeeklyInflation().catch((e) => {
                console.warn('[macroStartup] Rosstat weekly:', e.message);
            });
            console.log(`[macroStartup] Готово, сохранено точек: ${result.saved}`);
        } catch (err) {
            console.error('[macroStartup] Sync failed:', err.message);
        }
    }, STARTUP_DELAY_MS);
}

module.exports = {
    scheduleStaleInflationSyncOnStartup,
    getInflationYoyLatestDate,
    isStale,
};
