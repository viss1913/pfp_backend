const {
    pickPositive,
    formatCoverDateRu,
    extractPensionPlanFacts,
    calculateOwnFundsFromSchedule,
    computeInvestmentEndContext,
} = require('../rostechPdfUtils');

function moneyRub(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function moneyRubPerMonthShort(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${Math.round(n).toLocaleString('ru-RU')} ₽/мес.`;
}

function percentRu(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pctOfIncome(monthly, income) {
    const m = Number(monthly);
    const i = Number(income);
    if (!Number.isFinite(m) || !Number.isFinite(i) || i <= 0) return '—';
    return percentRu((m / i) * 100, 1);
}

function barHeightPx(value, maxValue, minPx = 20, maxPx = 130) {
    const v = Number(value);
    const max = Number(maxValue);
    if (!Number.isFinite(v) || !Number.isFinite(max) || max <= 0) return minPx;
    return Math.max(minPx, Math.round((v / max) * maxPx));
}

function barHeightPercent(value, maxValue, minPct = 12, maxPct = 97) {
    const v = Number(value);
    const max = Number(maxValue);
    if (!Number.isFinite(v) || !Number.isFinite(max) || max <= 0) return minPct;
    return Math.max(minPct, Math.round((v / max) * maxPct));
}

function formatDateLongFromMonths(goal, s, fallbackYear) {
    const ctx = computeInvestmentEndContext(goal, s);
    if (ctx?.dateLong) return ctx.dateLong;
    if (Number.isFinite(fallbackYear) && fallbackYear > 0) return `1 января ${fallbackYear} г.`;
    return '—';
}

function resolveClientFirstName(clientName) {
    return (
        String(clientName || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)[0] || 'Клиент'
    );
}

function resolveCurrentIncomeMonthly(goal, s, options) {
    return pickPositive(
        goal?.client?.avg_monthly_income ??
            goal?.avg_monthly_income ??
            s.avg_monthly_income ??
            options?.clientAvgMonthlyIncome ??
            options?.overallPlan?.avg_monthly_income,
        110000
    );
}

function resolveTaxBenefits(s, options) {
    const taxBenefitsTotals =
        options?.overallPlan?.tax_benefits?.totals ||
        options?.overallPlan?.summary?.tax_benefits_summary?.totals ||
        {};
    const nextCalendarYear = new Date().getFullYear() + 1;
    return {
        deduction2026: pickPositive(s.deduction_2026, taxBenefitsTotals.deduction_2026),
        cofinancing2026: pickPositive(s.cofinancing_2026, taxBenefitsTotals.cofinancing_2026),
        nextCalendarYear,
    };
}

function resolvePlanChartFacts(goal, s, totalCapital) {
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const ownFundsFallback = Math.max(initial + monthly * Math.max(targetMonths, 0), 0);
    const ownFunds = calculateOwnFundsFromSchedule(goal?.details?.monthly_schedule, ownFundsFallback);
    const incomeAndBenefits = Math.max(totalCapital - ownFunds, 0);
    const maxValue = Math.max(ownFunds, incomeAndBenefits, totalCapital, 1);
    return {
        ownFunds,
        incomeAndBenefits,
        totalCapital,
        chartBar1Value: moneyRub(ownFunds),
        chartBar2Value: moneyRub(incomeAndBenefits),
        chartBar3Value: moneyRub(totalCapital),
        chartBar1Height: barHeightPercent(ownFunds, maxValue),
        chartBar2Height: barHeightPercent(incomeAndBenefits, maxValue),
        chartBar3Height: barHeightPercent(totalCapital, maxValue),
    };
}

function resolvePlanYieldPercent(s, totalCapital, ownFunds) {
    const accumulationYieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const incomeAndBenefits = Math.max(totalCapital - ownFunds, 0);
    const totalYieldPercent = ownFunds > 0 ? Math.max((incomeAndBenefits / ownFunds) * 100, 0) : 0;
    const value =
        Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0
            ? accumulationYieldPercent
            : totalYieldPercent;
    return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveExpectedReturnRate(s, totalCapital, ownFunds) {
    const value = resolvePlanYieldPercent(s, totalCapital, ownFunds);
    return value == null ? '—' : percentRu(value, 1);
}

function resolveInflationRatePercent(goal, s) {
    const candidates = [s.inflation_rate, goal?.inflation_rate, goal?.details?.inflation_rate];
    for (const candidate of candidates) {
        const n = Number(candidate);
        if (Number.isFinite(n) && n >= 0) return n;
    }
    return null;
}

function resolveIndexationRatePercent(s, options = {}) {
    // «Индексировать пополнения на X%» — investment_expense_growth_annual из админки (через расчёт / overall_plan).
    const candidates = [
        options?.overallPlan?.investment_expense_growth_annual_percent,
        options?.overallPlan?.summary?.investment_expense_growth_annual_percent,
        options?.investmentExpenseGrowthAnnualPercent,
    ];
    for (const candidate of candidates) {
        const n = Number(candidate);
        if (Number.isFinite(n) && n >= 0) return n;
    }
    return null;
}

function buildCoverContext({ coverTitle, dateLine } = {}) {
    return {
        cover_title: coverTitle || 'Персональное финансовое решение',
        report_date: (dateLine || formatCoverDateRu()).replace(' г.', 'г.'),
    };
}

function buildPensionContext({ goal, clientName, options = {} }) {
    const s = goal?.summary || {};
    const sp = goal?.details?.state_pension || {};
    const yearsToPension = Number(sp.years_to_pension ?? 0);
    const retirementYear = Number(sp.retirement_year ?? 0);
    const retirementAge = Number(sp.retirement_age ?? 0);
    const currentReportYear = new Date().getFullYear();
    const displayRetirementYear =
        Number.isFinite(yearsToPension) && yearsToPension > 0
            ? currentReportYear + yearsToPension
            : Number.isFinite(retirementYear) && retirementYear > 0
              ? retirementYear
              : currentReportYear;

    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const inflationRate = resolveInflationRatePercent(goal, s);
    const indexationRate = resolveIndexationRatePercent(s, options);
    const targetPresent = Number(s.target_amount_initial ?? 0);
    const targetFuture = Number(s.target_amount_future ?? 0);
    const statePensionMonthlyToday = Number(s.state_pension_monthly_today ?? 0);
    const statePensionMonthlyFuture = Number(s.state_pension_monthly_future ?? 0);
    const pensionGapToday = Math.max(targetPresent - statePensionMonthlyToday, 0);
    const pensionGapFuture = Math.max(targetFuture - statePensionMonthlyFuture, 0);
    const totalCapital = Number(s.projected_capital_at_retirement ?? 0);

    const currentIncomeMonthly = resolveCurrentIncomeMonthly(goal, s, options);
    const tax = resolveTaxBenefits(s, options);
    const planFacts = extractPensionPlanFacts(goal?.details?.monthly_schedule, {
        initialCapital: initial,
        monthlyContribution: monthly,
        taxDeductionAmount: tax.deduction2026,
        taxDeductionYear: tax.nextCalendarYear,
        cofinancingAmount: tax.cofinancing2026,
        cofinancingYear: tax.nextCalendarYear,
    });
    const chart = resolvePlanChartFacts(goal, s, totalCapital);
    const expectedReturnRate = resolveExpectedReturnRate(s, totalCapital, chart.ownFunds);

    const targetBarHeight = barHeightPx(targetPresent, Math.max(targetPresent, targetFuture, 1), 20, 88);
    const targetFutureBarHeight = barHeightPx(targetFuture, Math.max(targetPresent, targetFuture, 1), 20, 130);
    const stateTodayBarHeight = barHeightPx(
        statePensionMonthlyToday,
        Math.max(statePensionMonthlyToday, statePensionMonthlyFuture, 1),
        20,
        60
    );
    const stateFutureBarHeight = barHeightPx(
        statePensionMonthlyFuture,
        Math.max(statePensionMonthlyToday, statePensionMonthlyFuture, 1),
        20,
        120
    );

    return {
        data: {
            client_name: resolveClientFirstName(clientName),
            client_income_monthly: moneyRub(currentIncomeMonthly),
            state_pension_age: Number.isFinite(retirementAge) && retirementAge > 0 ? `${retirementAge} лет` : '—',
            state_pension_year: String(displayRetirementYear),
            target_pension_monthly: moneyRubPerMonthShort(targetPresent),
            target_pension_monthly_inflated: moneyRubPerMonthShort(targetFuture),
            inflation_rate: inflationRate == null ? '—' : percentRu(inflationRate, 1),
            target_pension_year: `${displayRetirementYear} г.`,
            state_pension_today: moneyRubPerMonthShort(statePensionMonthlyToday),
            state_pension_inflated: moneyRubPerMonthShort(statePensionMonthlyFuture),
            deficit_today: moneyRubPerMonthShort(pensionGapToday),
            deficit_inflated: moneyRubPerMonthShort(pensionGapFuture),
            goal_achieve_date: formatDateLongFromMonths(goal, s, displayRetirementYear),
            cofinancing_next_year: moneyRub(planFacts.cofinancingAmount || tax.cofinancing2026),
            initial_contribution: moneyRub(planFacts.initialCapital || initial),
            monthly_contribution: moneyRubPerMonthShort(planFacts.monthlyContribution || monthly),
            monthly_contribution_pct: pctOfIncome(planFacts.monthlyContribution || monthly, currentIncomeMonthly),
            deduction_next_year: moneyRub(planFacts.taxDeductionAmount || tax.deduction2026),
            indexation_rate:
                indexationRate == null ? '—' : percentRu(indexationRate, indexationRate % 1 === 0 ? 0 : 1),
            projected_capital_end: moneyRub(totalCapital),
            payout_years_min: '5 лет (60 мес.)',
            expected_return_rate: expectedReturnRate,
            chart_bar_1_value: chart.chartBar1Value,
            chart_bar_2_value: chart.chartBar2Value,
            chart_bar_3_value: chart.chartBar3Value,
        },
        barHeights: {
            pensionIntroLeft: targetBarHeight,
            pensionIntroRight: targetFutureBarHeight,
            statePensionLeft: stateTodayBarHeight,
            statePensionRight: stateFutureBarHeight,
            planBar1: chart.chartBar1Height,
            planBar2: chart.chartBar2Height,
            planBar3: chart.chartBar3Height,
        },
    };
}

function buildInvestmentContext({ goal, clientName, options = {} }) {
    const s = goal?.summary || {};
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const totalCapitalEnd = Number(s.projected_capital_at_end ?? 0);
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const { year: displayEndYear, dateLong: displayEndDateLong } = computeInvestmentEndContext(goal, s);

    const currentIncomeMonthly = resolveCurrentIncomeMonthly(goal, s, options);
    const tax = resolveTaxBenefits(s, options);
    const planFacts = extractPensionPlanFacts(goal?.details?.monthly_schedule, {
        initialCapital: initial,
        monthlyContribution: monthly,
        taxDeductionAmount: tax.deduction2026,
        taxDeductionYear: tax.nextCalendarYear,
        cofinancingAmount: tax.cofinancing2026,
        cofinancingYear: tax.nextCalendarYear,
    });
    const chart = resolvePlanChartFacts(goal, s, totalCapitalEnd);
    const inflationRate = resolveInflationRatePercent(goal, s);
    const indexationRate = resolveIndexationRatePercent(s, options);
    const expectedReturnRate = resolveExpectedReturnRate(s, totalCapitalEnd, chart.ownFunds);

    const clientAge = Number(options?.clientAge ?? goal?.client?.age ?? NaN);
    const achieveAge =
        Number.isFinite(clientAge) && targetMonths > 0
            ? `${Math.round(clientAge + targetMonths / 12)} лет`
            : '—';

    return {
        data: {
            client_name: resolveClientFirstName(clientName),
            client_income_monthly: moneyRub(currentIncomeMonthly),
            goal_achieve_age: achieveAge,
            initial_contribution: moneyRub(planFacts.initialCapital || initial),
            monthly_contribution: moneyRubPerMonthShort(planFacts.monthlyContribution || monthly),
            monthly_contribution_pct: pctOfIncome(planFacts.monthlyContribution || monthly, currentIncomeMonthly),
            goal_achieve_year: `${displayEndYear} г.`,
            projected_capital_end: moneyRub(totalCapitalEnd),
            goal_achieve_date: displayEndDateLong,
            cofinancing_next_year: moneyRub(planFacts.cofinancingAmount || tax.cofinancing2026),
            deduction_next_year: moneyRub(planFacts.taxDeductionAmount || tax.deduction2026),
            indexation_rate:
                indexationRate == null ? '—' : percentRu(indexationRate, indexationRate % 1 === 0 ? 0 : 1),
            payout_years_min: '5 лет (60 мес.)',
            expected_return_rate: expectedReturnRate,
            chart_bar_1_value: chart.chartBar1Value,
            chart_bar_2_value: chart.chartBar2Value,
            chart_bar_3_value: chart.chartBar3Value,
        },
        barHeights: {
            introLeft: barHeightPx(initial, Math.max(initial, totalCapitalEnd, 1), 20, 60),
            introRight: barHeightPx(totalCapitalEnd, Math.max(initial, totalCapitalEnd, 1), 20, 130),
            planBar1: chart.chartBar1Height,
            planBar2: chart.chartBar2Height,
            planBar3: chart.chartBar3Height,
        },
    };
}

module.exports = {
    buildCoverContext,
    buildPensionContext,
    buildInvestmentContext,
};
