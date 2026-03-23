/**
 * Метрики по ряду Comon /api/v2/strategies/{id}/profit.
 * Используем поле value (уровень кривой): доходность как отношение уровней на интервалах.
 */

const MS_PER_DAY = 86400000;
const DAYS_PER_YEAR = 365.25;

function extractPoints(raw) {
    const arr = raw?.data?.strategy ?? raw?.strategy;
    if (!Array.isArray(arr)) return [];
    return arr
        .map((p) => ({
            date: p.date,
            value: Number(p.value),
            rValue: p.rValue != null && p.rValue !== '' ? Number(p.rValue) : null,
        }))
        .filter((p) => p.date && Number.isFinite(p.value));
}

function sortByDateAsc(points) {
    return [...points].sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** (end/start) - 1 */
function returnFromValues(vStart, vEnd) {
    if (vStart == null || vEnd == null || !(vStart > 0) || !Number.isFinite(vEnd)) return null;
    return vEnd / vStart - 1;
}

/**
 * Первая и последняя точка в окне [cutoffDate, lastDate] включительно.
 */
function windowByMinDate(sortedAsc, lastDate, minDateInclusive) {
    const inWin = sortedAsc.filter((p) => {
        const t = new Date(p.date);
        return t >= minDateInclusive && t <= lastDate;
    });
    if (inWin.length < 2) return null;
    return { start: inWin[0], end: inWin[inWin.length - 1] };
}

function toPct(fraction) {
    if (fraction == null || Number.isNaN(fraction)) return null;
    return Number((fraction * 100).toFixed(4));
}

/**
 * @param {object} rawBody — тело ответа Comon (как от axios)
 * @returns {object}
 */
function computeComonProfitMetrics(rawBody) {
    const sorted = sortByDateAsc(extractPoints(rawBody));
    if (sorted.length < 2) {
        return {
            ok: false,
            reason: 'insufficient_points',
            points_count: sorted.length,
            definitions: DEFINITIONS_RU,
        };
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const t0 = new Date(first.date);
    const t1 = new Date(last.date);
    const calendarDays = (t1 - t0) / MS_PER_DAY;
    const years = calendarDays / DAYS_PER_YEAR;

    const totalReturn = returnFromValues(first.value, last.value);

    let cagrAnnualized = null;
    if (years > 1 / DAYS_PER_YEAR && totalReturn != null && first.value > 0) {
        cagrAnnualized = (last.value / first.value) ** (1 / years) - 1;
    }

    const lastT = t1;
    const monthAgo = new Date(lastT);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const win30 = windowByMinDate(sorted, lastT, monthAgo);
    const last30dReturn = win30
        ? returnFromValues(win30.start.value, win30.end.value)
        : null;

    return {
        ok: true,
        points_count: sorted.length,
        first_date: first.date,
        last_date: last.date,
        calendar_days: Number(calendarDays.toFixed(2)),
        /** За весь доступный период: (последний value / первый value) - 1 */
        total_return: totalReturn,
        total_return_pct: toPct(totalReturn),
        /** За последние 30 календарных дней от даты последней точки */
        last_30d_return: last30dReturn,
        last_30d_return_pct: toPct(last30dReturn),
        /**
         * Среднегодовая в смысле CAGR за весь период: (last/first)^(1/лет) - 1, год = 365.25 дня.
         * При короткой истории цифра может быть шумной — смотри calendar_days.
         */
        cagr_annualized: cagrAnnualized,
        cagr_annualized_pct: toPct(cagrAnnualized),
        definitions: DEFINITIONS_RU,
    };
}

const DEFINITIONS_RU = {
    total_return:
        'Доля прироста за весь ряд: (последний value / первый value) − 1. Поле value — как отдаёт Comon.',
    last_30d_return:
        'За 30 календарных дней до даты последней точки: отношение уровня в конце окна к уровню в начале окна (по точкам ряда внутри окна).',
    cagr_annualized:
        'Годовая эквивалентная доходность (CAGR) за весь период между первой и последней датой: (last/first)^(1/лет) − 1, год = 365.25 суток.',
};

module.exports = {
    computeComonProfitMetrics,
    extractPoints,
    sortByDateAsc,
};
