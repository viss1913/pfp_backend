const settingsService = require('./src/services/settingsService');
(async () => {
    const line = await settingsService.findPassiveIncomeYieldLine(0, 228, true, 2);
    console.log('line for 228 months project 2:', line);
    process.exit(line ? 0 : 1);
})();
