'use strict';

const { extractGoals, formatMoneyRu } = require('./buildSummaryOverviewHtml');

const DEFAULT_MAIN_ON_OVERVIEW = 2;
const DEFAULT_CONTINUATION_CHUNK = 2;

/**
 * Доли в % по суммам (алгоритм крупнейших дробных остатков), сумма всегда 100 при total > 0.
 * @param {number[]} amounts
 * @returns {number[]}
 */
function allocatePercentages(amounts) {
    const total = amounts.reduce((s, x) => s + x, 0);
    if (total <= 0) return amounts.map(() => 0);
    const exact = amounts.map((a) => (100 * a) / total);
    const floor = exact.map((x) => Math.floor(x));
    let rem = 100 - floor.reduce((s, x) => s + x, 0);
    const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
    const out = [...floor];
    for (let k = 0; k < rem; k++) out[order[k % order.length].i]++;
    return out;
}

function mainGoalsExcludingProtection(goals) {
    return goals.filter((g) => g.goal_type !== 'FIN_RESERVE' && g.goal_type !== 'LIFE');
}

function goalInitialMonthly(g) {
    const initial = Number(g.summary?.initial_capital ?? g.smart_initial_capital ?? 0) || 0;
    const monthly = Number(g.summary?.monthly_replenishment ?? 0) || 0;
    return { initial, monthly };
}

/**
 * Поля карточки цели для PDF/фронта (срок + вторая строка как на сводной).
 * @param {object} goal
 */
function goalCardFields(goal) {
    const gt = goal.goal_type || 'OTHER';
    const months = Number(goal.summary?.target_months ?? goal.summary?.term_months);
    const years = Number.isFinite(months) ? Math.max(1, Math.round(months / 12)) : null;
    if (gt === 'PENSION') {
        const p = Number(goal.summary?.projected_pension_monthly_present);
        return {
            goal_id: goal.goal_id,
            goal_type: gt,
            goal_name: goal.goal_name || 'Цель',
            term_years: years,
            row_right_label: 'Желаемый доход:',
            row_right_display: Number.isFinite(p) ? `${formatMoneyRu(p)}/мес` : '—',
        };
    }
    const t = Number(goal.summary?.target_amount_initial ?? goal.details?.target_amount_initial);
    const ok = Number.isFinite(t) && t > 0;
    return {
        goal_id: goal.goal_id,
        goal_type: gt,
        goal_name: goal.goal_name || 'Цель',
        term_years: years,
        row_right_label: 'Стоимость:',
        row_right_display: ok ? `${(t / 1_000_000).toFixed(1)}М ₽` : '—',
    };
}

/**
 * Единый JSON для фронта/PDF: продолжение основных целей (после первых N на сводной) + «пирожки» по целям.
 * Фронт сам раскладывает по A4 (page-break), держит `capital_distribution` целиком на одной странице.
 *
 * @param {object} [reportPayload] — как ответ отчёта: `goals` / `goals_detailed` + опционально `summary`
 * @param {object} [options]
 * @param {number} [options.mainGoalsOnOverviewPage=2] — сколько основных целей уже на HTML-сводной (buildReportSummaryOverviewHtml)
 * @param {number} [options.goalsPerContinuationPage=2] — подсказка, сколько карточек влезает в ряд/страницу
 */
function buildSummaryPdfLayoutModel(reportPayload = {}, options = {}) {
    const goals = extractGoals(reportPayload);
    const mainGoals = mainGoalsExcludingProtection(goals);
    const firstN = options.mainGoalsOnOverviewPage ?? DEFAULT_MAIN_ON_OVERVIEW;
    const chunk = options.goalsPerContinuationPage ?? DEFAULT_CONTINUATION_CHUNK;

    const overviewMain = mainGoals.slice(0, firstN);
    const continuationMain = mainGoals.slice(firstN);

    const continuationPages = [];
    for (let i = 0; i < continuationMain.length; i += chunk) {
        continuationPages.push({
            page_index: continuationPages.length,
            goals: continuationMain.slice(i, i + chunk).map(goalCardFields),
        });
    }

    const initialAmounts = goals.map((g) => goalInitialMonthly(g).initial);
    const monthlyAmounts = goals.map((g) => goalInitialMonthly(g).monthly);
    const initPerc = allocatePercentages(initialAmounts);
    const monPerc = allocatePercentages(monthlyAmounts);

    const totalInitial = Math.round(initialAmounts.reduce((s, x) => s + x, 0) * 100) / 100;
    const totalMonthly = Math.round(monthlyAmounts.reduce((s, x) => s + x, 0) * 100) / 100;

    const capital_distribution =
        goals.length > 0
            ? {
                  block_id: 'capital_distribution',
                  title: 'Распределение капитала',
                  initial_capital: {
                      title: 'Распределение начального капитала по целям',
                      total: totalInitial,
                      total_display: `${formatMoneyRu(totalInitial)}`,
                      segments: goals.map((g, i) => ({
                          goal_id: g.goal_id,
                          goal_type: g.goal_type,
                          goal_name: g.goal_name || '—',
                          amount: Math.round(initialAmounts[i] * 100) / 100,
                          share_percent: initPerc[i],
                      })),
                  },
                  monthly_replenishment: {
                      title: 'Распределение ежемесячных пополнений по целям',
                      total: totalMonthly,
                      total_display: `${formatMoneyRu(totalMonthly)}/мес`,
                      segments: goals.map((g, i) => ({
                          goal_id: g.goal_id,
                          goal_type: g.goal_type,
                          goal_name: g.goal_name || '—',
                          amount: Math.round(monthlyAmounts[i] * 100) / 100,
                          share_percent: monPerc[i],
                      })),
                  },
              }
            : null;

    return {
        version: 1,
        layout_hints: {
            /** не резать между страницами целиком */
            keep_blocks_together: ['capital_distribution'],
            main_goals_on_first_overview_html: firstN,
            suggested_goals_per_continuation_page: chunk,
        },
        overview_main_goal_cards: overviewMain.map(goalCardFields),
        goals_continuation:
            continuationPages.length > 0
                ? {
                      block_id: 'goals_continuation',
                      title: 'Основные цели (продолжение)',
                      pages: continuationPages,
                  }
                : null,
        capital_distribution,
    };
}

module.exports = {
    buildSummaryPdfLayoutModel,
    allocatePercentages,
    goalCardFields,
};
