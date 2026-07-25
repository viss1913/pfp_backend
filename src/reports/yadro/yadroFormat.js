const { formatCoverDateRu } = require('../cover/buildCoverHtml');

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

function pickPositive(...candidates) {
    for (const c of candidates) {
        const n = toNum(c);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

function money(v, { suffix = ' ₽', digits = 0 } = {}) {
    const n = toNum(v);
    if (!Number.isFinite(n)) return '—';
    const formatted =
        digits > 0
            ? n.toLocaleString('ru-RU', {
                  minimumFractionDigits: digits,
                  maximumFractionDigits: digits,
              })
            : Math.round(n).toLocaleString('ru-RU');
    return `${formatted}${suffix}`;
}

function moneyPerMonth(v) {
    const m = money(v);
    return m === '—' ? m : `${m}/мес.`;
}

function percent(v, { digits = 0, suffix = '%' } = {}) {
    const n = toNum(v);
    if (!Number.isFinite(n)) return '—';
    const formatted =
        digits > 0
            ? n.toLocaleString('ru-RU', {
                  minimumFractionDigits: digits,
                  maximumFractionDigits: digits,
              })
            : String(Math.round(n));
    return `${formatted}${suffix}`;
}

function yearLabel(y) {
    const n = toNum(y);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${Math.round(n)} г.`;
}

function dateLongRu(value) {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) {
        // already formatted?
        return String(value);
    }
    return formatCoverDateRu(d).replace(/\s*г\.\s*$/i, 'г.');
}

function formatDdMmYyyy(value) {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}.${mm}.${yyyy}`;
}

function formatCoverDateYadro(date = new Date()) {
    // Figma sample: «15 мая 2025г.» (без пробела перед г.)
    return formatCoverDateRu(date).replace(/\s+г\.\s*$/i, 'г.');
}

function isScheduleInitialLumpRow(row) {
    return Boolean(row && String(row.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP');
}

function sortedSchedule(monthlySchedule) {
    return Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
}

function extractPlanFacts(monthlySchedule, fallback = {}) {
    const schedule = sortedSchedule(monthlySchedule);
    const first = schedule[0] || null;
    let initialFromSchedule = NaN;
    if (first && isScheduleInitialLumpRow(first)) {
        initialFromSchedule = toNum(first.replenishment);
    } else if (first) {
        initialFromSchedule =
            toNum(first.total_capital) - toNum(first.replenishment) - toNum(first.cofinancing);
    }
    const firstRegular =
        schedule.find((row) => row && row.date && !isScheduleInitialLumpRow(row)) || null;
    const monthlyFromSchedule = firstRegular ? toNum(firstRegular.replenishment) : NaN;
    const firstTaxRow = schedule.find((row) => toNum(row.tax_deduction) > 0) || null;
    const firstCofRow = schedule.find((row) => toNum(row.cofinancing) > 0) || null;
    const taxYear = firstTaxRow
        ? new Date(`${firstTaxRow.date}T00:00:00Z`).getUTCFullYear()
        : null;
    const cofinYear = firstCofRow
        ? new Date(`${firstCofRow.date}T00:00:00Z`).getUTCFullYear()
        : null;

    return {
        initialCapital: Number.isFinite(initialFromSchedule)
            ? initialFromSchedule
            : toNum(fallback.initialCapital) || 0,
        monthlyContribution: Number.isFinite(monthlyFromSchedule)
            ? monthlyFromSchedule
            : toNum(fallback.monthlyContribution) || 0,
        taxDeductionAmount: firstTaxRow
            ? toNum(firstTaxRow.tax_deduction)
            : toNum(fallback.taxDeductionAmount) || 0,
        taxDeductionYear: taxYear || fallback.taxDeductionYear || null,
        cofinancingAmount: firstCofRow
            ? toNum(firstCofRow.cofinancing)
            : toNum(fallback.cofinancingAmount) || 0,
        cofinancingYear: cofinYear || fallback.cofinancingYear || null,
    };
}

module.exports = {
    toNum,
    pickPositive,
    money,
    moneyPerMonth,
    percent,
    yearLabel,
    dateLongRu,
    formatDdMmYyyy,
    formatCoverDateYadro,
    isScheduleInitialLumpRow,
    sortedSchedule,
    extractPlanFacts,
};
