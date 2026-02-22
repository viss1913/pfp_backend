const macroService = require('../services/macroService');
const rosstatService = require('../services/rosstatService');

/**
 * Контроллер макроэкономических данных
 */
const getLatest = async (req, res) => {
    try {
        const data = await macroService.getLatestValues();
        res.json({
            success: true,
            data
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

const triggerSync = async (req, res) => {
    try {
        console.log('🚀 Manual macro sync triggered');

        // MOEX
        await macroService.syncImoex();
        await macroService.syncOfzYields();
        await macroService.syncCorpBonds();

        // CBR (SOAP + HTML)
        await macroService.fetchCbrKeyRate();
        await macroService.fetchCbrInflation();
        await macroService.fetchCbrDepositRates();
        await macroService.fetchCbrGold();
        await macroService.fetchCbrCurrencyRates();

        // Rosstat
        await rosstatService.fetchMonthlyInflation();
        await rosstatService.fetchWeeklyInflation();

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
    triggerSync
};
