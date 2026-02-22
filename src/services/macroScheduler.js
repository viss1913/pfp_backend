const cron = require('node-cron');
const macroService = require('./macroService');
const rosstatService = require('./rosstatService');

/**
 * Планировщик задач по сбору макроданных
 */
class MacroScheduler {
    initScheduler() {
        console.log('📅 Initializing Macro Data Scheduler...');

        // 1. Ежедневные задачи (MOEX) — каждый будний день в 19:05 (после закрытия торгов)
        cron.schedule('5 19 * * 1-5', async () => {
            console.log('⏰ Running daily MOEX sync...');
            try {
                await macroService.syncImoex();
                await macroService.syncOfzYields();
                await macroService.syncCorpBonds();
                console.log('✅ Daily MOEX sync completed');
            } catch (error) {
                console.error('❌ Daily MOEX sync failed:', error.message);
            }
        });

        // 2. Ежедневная ключевая ставка ЦБР (SOAP) — каждый день в 10:00
        cron.schedule('0 10 * * *', async () => {
            console.log('⏰ Running daily CBR Key Rate sync...');
            try {
                await macroService.fetchCbrKeyRate();
                await macroService.fetchCbrGold();
                await macroService.fetchCbrCurrencyRates();
                console.log('✅ CBR Key Rate sync completed');
            } catch (error) {
                console.error('❌ CBR Key Rate sync failed:', error.message);
            }
        });

        // 3. Еженедельная инфляция ЦБР и Росстата — каждый вторник в 10:30
        cron.schedule('30 10 * * 2', async () => {
            console.log('⏰ Running weekly Inflation sync...');
            try {
                await macroService.fetchCbrInflation();
                await rosstatService.fetchWeeklyInflation();
                console.log('✅ Weekly Inflation sync completed');
            } catch (error) {
                console.error('❌ Weekly Inflation sync failed:', error.message);
            }
        });

        // 4. Месячная инфляция Росстата — 10-го числа в 11:00
        cron.schedule('0 11 10 * *', async () => {
            console.log('⏰ Running monthly Rosstat Inflation sync...');
            try {
                await rosstatService.fetchMonthlyInflation();
                console.log('✅ Monthly Rosstat Inflation sync completed');
            } catch (error) {
                console.error('❌ Monthly Rosstat sync failed:', error.message);
            }
        });

        // 4. Декадные ставки по вкладам (HTML) — 2, 12, 22 числа (на следующий день после публикации ЦБ)
        cron.schedule('0 11 2,12,22 * *', async () => {
            console.log('⏰ Running decadal CBR Deposit Rates sync...');
            try {
                await macroService.fetchCbrDepositRates();
                console.log('✅ Decadal CBR Deposit Rates sync completed');
            } catch (error) {
                console.error('❌ Decadal CBR sync failed:', error.message);
            }
        });

        console.log('✅ Macro Data Scheduler started');
    }
}

module.exports = new MacroScheduler();
