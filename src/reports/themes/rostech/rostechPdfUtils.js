function pickPositive(primary, fallback) {
    const p = Number(primary);
    if (Number.isFinite(p) && p > 0) return p;
    const f = Number(fallback);
    if (Number.isFinite(f) && f > 0) return f;
    return 0;
}

function formatCoverDateRu(date = new Date()) {
    const tz = process.env.REPORT_PDF_TZ || 'Europe/Moscow';
    let formatted = new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: tz,
    }).format(date);
    formatted = formatted.replace(/\s*г\.?\s*$/i, '').trim();
    return `${formatted} г.`;
}

function isScheduleInitialLumpRow(row) {
    return Boolean(row && String(row.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP');
}

function calculateAugNextYearEffectivenessPercent(monthlySchedule) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    if (!schedule.length) return { percent: null, startYear: null };

    const toDate = (value) => new Date(`${value}T00:00:00Z`);
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };
    const first = schedule[0];
    const startDate = toDate(first.date);
    const endDate = new Date(Date.UTC(startDate.getUTCFullYear() + 1, 7, 1));
    const rows = schedule.filter((row) => toDate(row.date) <= endDate);
    if (!rows.length) return { percent: null, startYear: startDate.getUTCFullYear() };

    const monthsBetween = (from, to) =>
        (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    const totalMonths = Math.max(monthsBetween(startDate, endDate) + 1, 1);

    const k0 = toNum(first.total_capital) - toNum(first.replenishment) - toNum(first.cofinancing);
    const kEnd = toNum(rows[rows.length - 1].total_capital);
    const replenishmentSum = rows.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    const taxSum = rows.reduce((sum, row) => sum + toNum(row.tax_deduction), 0);
    const cofinancingSum = rows.reduce((sum, row) => sum + toNum(row.cofinancing), 0);
    const investmentIncome = kEnd - k0 - replenishmentSum - cofinancingSum;

    const weightedReplenishments = rows.reduce((sum, row) => {
        const monthsLeft = Math.max(monthsBetween(toDate(row.date), endDate) + 1, 0);
        return sum + toNum(row.replenishment) * (monthsLeft / totalMonths);
    }, 0);
    const avgBase = k0 + weightedReplenishments;
    if (!(avgBase > 0)) return { percent: null, startYear: startDate.getUTCFullYear() };

    return {
        percent: ((investmentIncome + taxSum + cofinancingSum) / avgBase) * 100,
        startYear: startDate.getUTCFullYear(),
    };
}

function extractPensionPlanFacts(monthlySchedule, fallback = {}) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const first = schedule[0] || null;
    let initialFromSchedule = NaN;
    if (first && isScheduleInitialLumpRow(first)) {
        initialFromSchedule = toNum(first.replenishment);
    } else if (first) {
        initialFromSchedule = toNum(first.total_capital) - toNum(first.replenishment) - toNum(first.cofinancing);
    }
    const firstRegular = schedule.find((row) => row && row.date && !isScheduleInitialLumpRow(row)) || null;
    const monthlyFromSchedule = firstRegular ? toNum(firstRegular.replenishment) : NaN;

    const firstTaxRow = schedule.find((row) => toNum(row.tax_deduction) > 0) || null;
    const firstCofRow = schedule.find((row) => toNum(row.cofinancing) > 0) || null;
    const taxYear = firstTaxRow ? new Date(`${firstTaxRow.date}T00:00:00Z`).getUTCFullYear() : null;
    const cofinYear = firstCofRow ? new Date(`${firstCofRow.date}T00:00:00Z`).getUTCFullYear() : null;

    return {
        initialCapital: Number.isFinite(initialFromSchedule) ? initialFromSchedule : toNum(fallback.initialCapital),
        monthlyContribution: Number.isFinite(monthlyFromSchedule)
            ? monthlyFromSchedule
            : toNum(fallback.monthlyContribution),
        taxDeductionAmount: firstTaxRow ? toNum(firstTaxRow.tax_deduction) : toNum(fallback.taxDeductionAmount),
        taxDeductionYear: taxYear || fallback.taxDeductionYear || null,
        cofinancingAmount: firstCofRow ? toNum(firstCofRow.cofinancing) : toNum(fallback.cofinancingAmount),
        cofinancingYear: cofinYear || fallback.cofinancingYear || null,
    };
}

function calculateOwnFundsFromSchedule(monthlySchedule, fallbackOwnFunds = 0) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    if (!schedule.length) return Number(fallbackOwnFunds) || 0;

    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };
    const first = schedule[0];
    const initialFromSchedule =
        toNum(first.total_capital) - toNum(first.replenishment) - toNum(first.cofinancing);
    const replenishmentSum = schedule.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    return Math.max(initialFromSchedule + replenishmentSum, 0);
}

function computeInvestmentEndContext(goal, s) {
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const schedule = Array.isArray(goal?.details?.monthly_schedule)
        ? goal.details.monthly_schedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const baseRow =
        schedule.find((row) => row && row.date && !isScheduleInitialLumpRow(row)) || schedule[0] || null;
    const base = baseRow
        ? new Date(`${baseRow.date}T00:00:00Z`)
        : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const end = new Date(base);
    if (Number.isFinite(targetMonths) && targetMonths > 0) {
        end.setUTCMonth(end.getUTCMonth() + targetMonths);
    }
    const monthsRu = [
        'января',
        'февраля',
        'марта',
        'апреля',
        'мая',
        'июня',
        'июля',
        'августа',
        'сентября',
        'октября',
        'ноября',
        'декабря',
    ];
    const dateLong = `${end.getUTCDate()} ${monthsRu[end.getUTCMonth()]} ${end.getUTCFullYear()} г.`;
    return { year: end.getUTCFullYear(), dateLong, end };
}

module.exports = {
    pickPositive,
    formatCoverDateRu,
    isScheduleInitialLumpRow,
    calculateAugNextYearEffectivenessPercent,
    extractPensionPlanFacts,
    calculateOwnFundsFromSchedule,
    computeInvestmentEndContext,
};
