const macroService = require('../services/macroService');
const rosstatService = require('../services/rosstatService');
const { runCbrInflationYoySync } = require('../services/macroInflationSyncNotifyService');

/**
 * Контроллер макроэкономических данных
 */
const INFLATION_YOY_SLUG = 'russia_cpi_inflation_yoy';

const getLatest = async (req, res) => {
    try {
        const data = await macroService.getLatestValues();
        const inflationYoy = data.find((row) => row.slug === INFLATION_YOY_SLUG) || null;
        res.json({
            success: true,
            data,
            /** Основной ряд ИПЦ г/г для виджетов и ЛК — slug russia_cpi_inflation_yoy */
            inflation_yoy: inflationYoy,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getHistory = async (req, res) => {
    try {
        const { slug } = req.params;
        const { from, to } = req.query;

        const data = await macroService.getHistory(slug, from, to);
        if (!data) {
            return res.status(404).json({ success: false, message: 'Indicator not found' });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

async function runInflationBundle(trigger) {
    const cbr = await runCbrInflationYoySync(trigger);
    let rosstatWeekly = null;
    let rosstatMonthly = null;
    try {
        rosstatWeekly = await rosstatService.fetchWeeklyInflation();
    } catch (e) {
        console.warn('[macro] Rosstat weekly failed:', e.message);
    }
    return { cbr, rosstatWeekly, rosstatMonthly };
}

/**
 * POST /api/pfp/macro/cron/inflation — только MACRO_CRON_SECRET, без JWT (Railway / внешний cron).
 */
const triggerCronInflationSync = async (req, res) => {
    try {
        const includeMonthly = req.query.monthly === '1' || req.query.monthly === 'true';
        console.log('⏰ Cron inflation sync triggered');
        const result = await runInflationBundle('api:cron:inflation');
        if (includeMonthly) {
            try {
                result.rosstatMonthly = await rosstatService.fetchMonthlyInflation();
            } catch (e) {
                console.warn('[macro] Rosstat monthly failed:', e.message);
            }
        }
        const latestRow = (await macroService.getLatestValues()).find((r) => r.slug === INFLATION_YOY_SLUG);
        res.json({
            success: true,
            message: 'Inflation macro sync completed',
            saved: result.cbr?.saved,
            inflation_yoy: latestRow || null,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const triggerSync = async (req, res) => {
    try {
        console.log('🚀 Manual macro sync triggered');

        // MOEX
        await macroService.syncImoex();
        await macroService.syncOfzYields();
        await macroService.syncCorpBonds();

        // CBR (SOAP + HTML)
        await macroService.fetchCbrKeyRate();
        await runInflationBundle('api:sync');
        await macroService.fetchCbrDepositRates();
        await macroService.fetchCbrGold();
        await macroService.fetchCbrCurrencyRates();

        await rosstatService.fetchMonthlyInflation();

        res.json({
            success: true,
            message: 'All macro data synced successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getLatest,
    getHistory,
    triggerSync,
    triggerCronInflationSync,
};
