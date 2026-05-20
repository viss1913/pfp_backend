/**
 * Собственные средства по цели: старт + сумма пополнений из monthly_schedule (с индексацией из симуляции).
 * Эталон — defaultRostechStyleCharts / Rostech goal pages.
 */

function toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function sortedSchedule(monthlySchedule) {
    return Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
}

function calculateOwnFundsFromSchedule(monthlySchedule, fallbackOwnFunds = 0) {
    const schedule = sortedSchedule(monthlySchedule);
    if (!schedule.length) return Math.max(0, toNum(fallbackOwnFunds));

    const first = schedule[0];
    const initialFromSchedule =
        toNum(first.total_capital) -
        toNum(first.replenishment) -
        toNum(first.tax_deduction) -
        toNum(first.cofinancing);
    const replenishmentSum = schedule.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    return Math.max(initialFromSchedule + replenishmentSum, 0);
}

function sumReplenishmentsFromSchedule(monthlySchedule) {
    const schedule = sortedSchedule(monthlySchedule);
    if (!schedule.length) return 0;
    return schedule.reduce((sum, row) => sum + toNum(row.replenishment), 0);
}

module.exports = {
    calculateOwnFundsFromSchedule,
    sumReplenishmentsFromSchedule,
};
