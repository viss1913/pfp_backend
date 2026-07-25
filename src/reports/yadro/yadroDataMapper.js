const { calculateOwnFundsFromSchedule } = require('../shared/ownFundsFromSchedule');
const {
    toNum,
    pickPositive,
    money,
    moneyPerMonth,
    percent,
    yearLabel,
    dateLongRu,
    formatDdMmYyyy,
    formatCoverDateYadro,
    sortedSchedule,
    extractPlanFacts,
} = require('./yadroFormat');

/**
 * Какой набор шаблонов Yadro использовать для goal_type / имени цели.
 * @returns {'pension'|'capital'|'flat'|'passive'|'child'|'moon'}
 */
function resolveYadroGoalKind(goalType, goalName = '') {
    const gt = String(goalType || '').toUpperCase();
    const n = String(goalName || '').toLowerCase();

    if (gt === 'PENSION') return 'pension';
    if (gt === 'PASSIVE_INCOME' || gt === 'RENT') return 'passive';
    if (gt === 'INVESTMENT') return 'capital';
    if (gt === 'INHERITANCE') return 'moon';
    if (gt === 'FIN_RESERVE' || gt === 'LIFE') return 'capital';

    // OTHER — по названию
    if (/квартир|flat|жиль|апарт/.test(n)) return 'flat';
    if (/дет|ребен|ребён|образован|child|универ|школ/.test(n)) return 'child';
    if (/пассив|rent|аренд/.test(n)) return 'passive';
    if (/пенс|достойная/.test(n)) return 'pension';
    if (/накоплен|капитал|сбереж|инвест|сохранить|преумнож/.test(n)) return 'capital';
    return 'moon';
}

function goalTitleNumbered(index, title) {
    const t = String(title || 'Цель').trim() || 'Цель';
    // если уже начинается с цифры — не дублируем
    if (/^\d+[\.\)]\s*/.test(t)) return t;
    return `${index}. ${t}`;
}

function commonContextFromReport(report, options = {}) {
    const client = report?.client_info || {};
    const overall = report?.overall_plan || options.overallPlan || {};
    const income = pickPositive(
        client.avg_monthly_income,
        options.clientAvgMonthlyIncome,
        overall.avg_monthly_income
    );
    const inflation =
        pickPositive(
            overall.inflation_rate,
            overall.assumptions?.inflation_rate,
            options.inflationRate,
            5
        ) || 5;

    return {
        clientName: client.first_name || client.full_name || options.clientName || 'Клиент',
        clientIncomeMonthly: income,
        inflationRate: inflation,
        reportDate: formatCoverDateYadro(),
        coverTitle: options.coverTitle || 'ПЕРСОНАЛЬНОЕ ФИНАНСОВОЕ РЕШЕНИЕ',
        overallPlan: overall,
    };
}

function goalCoreMetrics(goal, common) {
    const s = goal?.summary || {};
    const details = goal?.details || {};
    const schedule = details.monthly_schedule;
    const taxBenefitsTotals =
        common.overallPlan?.tax_benefits?.totals ||
        common.overallPlan?.summary?.tax_benefits_summary?.totals ||
        {};

    const monthly = pickPositive(s.monthly_replenishment, s.monthly_contribution);
    const initial = pickPositive(s.initial_capital, s.initial_lump);
    const planFacts = extractPlanFacts(schedule, {
        initialCapital: initial,
        monthlyContribution: monthly,
        taxDeductionAmount: pickPositive(s.deduction_2026, taxBenefitsTotals.deduction_2026),
        cofinancingAmount: pickPositive(s.cofinancing_2026, taxBenefitsTotals.cofinancing_2026),
        taxDeductionYear: new Date().getFullYear() + 1,
        cofinancingYear: new Date().getFullYear() + 1,
    });

    const targetMonths = pickPositive(s.target_months, s.term_months);
    const yearsTo =
        pickPositive(
            details.state_pension?.years_to_pension,
            s.years_to_goal,
            targetMonths ? targetMonths / 12 : 0
        ) || 0;
    const currentYear = new Date().getFullYear();
    const targetYear = pickPositive(
        details.state_pension?.retirement_year,
        s.target_year,
        s.end_year,
        yearsTo ? currentYear + Math.round(yearsTo) : 0
    );

    const ownFundsFallback = Math.max(planFacts.initialCapital + planFacts.monthlyContribution * Math.max(targetMonths, 0), 0);
    const ownFunds = calculateOwnFundsFromSchedule(schedule, ownFundsFallback);
    const totalCapital = pickPositive(
        s.projected_capital_at_retirement,
        s.projected_capital,
        s.target_capital,
        s.final_capital
    );
    const projectedIncome = Math.max(totalCapital - ownFunds, 0);

    const targetPresent = pickPositive(s.target_amount_initial, s.target_amount_present, s.target_amount);
    const targetFuture = pickPositive(s.target_amount_future, s.target_amount);
    const projectedPresent = pickPositive(
        s.projected_pension_monthly_present,
        s.state_pension_monthly_today,
        s.monthly_income_present
    );
    const projectedFuture = pickPositive(
        s.projected_pension_monthly_future,
        s.state_pension_monthly_future,
        s.monthly_income_future
    );
    const accumulationYield = pickPositive(
        s.accumulation_yield_percent,
        s.expected_yield_percent,
        s.yield_percent,
        10
    );
    const payoutYield = pickPositive(s.payout_yield_percent, accumulationYield);
    const inflation = pickPositive(s.inflation_rate, common.inflationRate, 5);

    const endDate =
        s.target_date ||
        s.end_date ||
        (Array.isArray(schedule) && schedule.length
            ? schedule[schedule.length - 1].date
            : null);

    return {
        goal,
        summary: s,
        details,
        schedule: sortedSchedule(schedule),
        planFacts,
        ownFunds,
        projectedIncome,
        totalCapital,
        targetPresent,
        targetFuture,
        projectedPresent,
        projectedFuture,
        targetYear,
        yearsTo,
        accumulationYield,
        payoutYield,
        inflation,
        endDate,
        monthly: planFacts.monthlyContribution,
        initial: planFacts.initialCapital,
    };
}

function coverPlaceholders(common) {
    return {
        cover_title: common.coverTitle,
        report_date: common.reportDate,
    };
}

function buildPlanPlaceholders(m, common) {
    const cofinYear = m.planFacts.cofinancingYear || new Date().getFullYear();
    const taxYear = m.planFacts.taxDeductionYear || new Date().getFullYear() + 1;
    const incomeStr = money(common.clientIncomeMonthly);
    return {
        client_income_monthly: incomeStr === '—' ? '— по НДФЛ' : `${incomeStr} по НДФЛ`,
        inflation_rate: `${percent(m.inflation, { digits: 0 })} в год (оптимистичный прогноз)`,
        plan_initial_contribution: money(m.initial),
        plan_monthly_contribution: moneyPerMonth(m.monthly),
        plan_cofinancing_year: money(m.planFacts.cofinancingAmount),
        plan_tax_deduction_year: money(m.planFacts.taxDeductionAmount),
        // year-tagged variants used in some pages
        gov_cofinancing_2025: money(m.planFacts.cofinancingAmount),
        tax_deduction_2026: money(m.planFacts.taxDeductionAmount),
        chart_own_funds: money(m.ownFunds),
        chart_projected_income: money(m.projectedIncome),
        chart_date_start: formatDdMmYyyy(m.schedule[0]?.date) || formatDdMmYyyy(new Date()),
        chart_date_end:
            formatDdMmYyyy(m.schedule[m.schedule.length - 1]?.date) ||
            formatDdMmYyyy(m.endDate) ||
            formatDdMmYyyy(new Date()),
        chart_y_max: money(Math.max(m.totalCapital, m.ownFunds + m.projectedIncome, 1)),
        cofin_year_label: String(cofinYear),
        tax_year_label: String(taxYear),
    };
}

function pensionPlaceholders(m, common, goalIndex = 1) {
    const sp = m.details.state_pension || {};
    const s = m.summary;
    const stateToday = pickPositive(
        s.state_pension_monthly_today,
        m.projectedPresent,
        sp.monthly_today
    );
    const stateFuture = pickPositive(
        s.state_pension_monthly_future,
        m.projectedFuture,
        sp.monthly_future
    );
    const targetPresent = m.targetPresent || pickPositive(s.target_amount_initial);
    const additionalToday = Math.max(targetPresent - stateToday, 0);
    const additionalFuture = pickPositive(
        s.additional_income_future,
        m.totalCapital > 0 ? (m.totalCapital * (m.payoutYield / 100)) / 12 : 0,
        Math.max(m.targetFuture - stateFuture, 0)
    );
    const replacement = pickPositive(
        s.income_replacement_rate,
        s.replacement_rate,
        common.clientIncomeMonthly > 0 ? (stateToday / common.clientIncomeMonthly) * 100 : 0
    );
    const startYear = m.targetYear || new Date().getFullYear();
    const plan = buildPlanPlaceholders(m, common);

    return {
        ...plan,
        goal1_title: goalTitleNumbered(1, 'Государственная пенсия'),
        goal1_title_full: '1. Государственная пенсия',
        goal1_start_year: yearLabel(startYear),
        goal1_forecast_inflation: moneyPerMonth(stateFuture),
        goal1_forecast_today: moneyPerMonth(stateToday),
        goal1_replacement_rate: percent(replacement),
        goal2_title: goalTitleNumbered(2, 'Дополнительный пассивный доход в будущем'),
        goal2_title_full: '2. Дополнительный пассивный доход в будущем',
        goal2_start_year: yearLabel(startYear),
        goal2_forecast_inflation: moneyPerMonth(additionalFuture),
        goal2_forecast_today: moneyPerMonth(additionalToday),
        goal2_forecast_inflation_full: moneyPerMonth(additionalFuture),
        goal2_inflation_rate: percent(m.inflation),
        goal2_target_date: dateLongRu(m.endDate) || yearLabel(startYear),
        // state pension page
        salary_monthly: moneyPerMonth(common.clientIncomeMonthly),
        base_part_today: money(pickPositive(s.fixed_payment_current, sp.fixed_payment_current, 9584)),
        base_part_future: money(
            pickPositive(s.fixed_payment_future, sp.fixed_payment_future, s.fixed_payment_current)
        ),
        points_per_year: String(
            pickPositive(s.ipk_per_year, sp.ipk_per_year, 4.4).toLocaleString('ru-RU', {
                maximumFractionDigits: 1,
            })
        ),
        points_total: String(Math.round(pickPositive(s.total_ipk, sp.total_ipk, sp.ipk_total, 169))),
        point_cost_today: money(
            pickPositive(s.ipk_cost_current, sp.ipk_cost_current, sp.point_cost_today, 156.76),
            { digits: 2 }
        ),
        point_cost_future: money(
            pickPositive(s.ipk_cost_future, sp.ipk_cost_future, sp.point_cost_future),
            { digits: 2 }
        ),
        final_pension_today: moneyPerMonth(stateToday),
        final_pension_future: moneyPerMonth(stateFuture),
        replacement_rate: percent(replacement),
        chart_salary: moneyPerMonth(common.clientIncomeMonthly),
        chart_pension: moneyPerMonth(stateToday),
        // plan page (pension-03 / passive-02)
        capital_growth_total: money(m.totalCapital),
        goal_forecast_inflation: moneyPerMonth(additionalFuture),
        goal_inflation_rate: percent(m.inflation),
        goal_target_date: dateLongRu(m.endDate) || yearLabel(startYear),
        goal_title_full: String(m.goal?.goal_name || 'Дополнительный пассивный доход'),
        ndfl_rate: '13%',
        next_months_contribution: moneyPerMonth(m.monthly),
        pds_gov_addon_year: money(36000),
        pds_insurance_cap: money(2800000),
        pds_tax_deduction_cap: money(400000),
        pds_tax_deduction_pct: '13%',
        plan_review_months: '12',
        gov_cofinancing: money(m.planFacts.cofinancingAmount || m.summary.total_cofinancing),
        tax_deduction: money(m.planFacts.taxDeductionAmount || m.summary.total_tax_benefit),
        own_savings: money(m.ownFunds),
        extra_income: money(m.projectedIncome),
        pds_yield_rate: percent(m.accumulationYield),
        result_total: money(m.totalCapital),
        result_year: yearLabel(startYear),
    };
}

function genericGoalPlaceholders(m, common, kind, goalIndex = 1) {
    const plan = buildPlanPlaceholders(m, common);
    const rawTitle = String(m.goal?.goal_name || kindTitle(kind)).trim();
    const title = goalTitleNumbered(goalIndex, rawTitle);
    const targetYear = m.targetYear || new Date().getFullYear();
    const forecast =
        m.targetFuture ||
        m.totalCapital ||
        m.targetPresent ||
        0;

    const steps = buildSteps(m, kind);

    return {
        ...plan,
        goal_title: title,
        goal_title_full: title,
        goal_target_year: yearLabel(targetYear),
        goal_target_date: dateLongRu(m.endDate) || yearLabel(targetYear),
        goal_forecast: money(forecast),
        goal_forecast_inflation: moneyPerMonth(
            pickPositive(m.summary.monthly_income_future, m.projectedFuture, m.targetFuture / 12)
        ),
        result_total: money(m.totalCapital || forecast),
        result_year: yearLabel(targetYear),
        own_savings: money(m.ownFunds),
        gov_cofinancing: money(m.planFacts.cofinancingAmount || m.summary.total_cofinancing),
        tax_deduction: money(m.planFacts.taxDeductionAmount || m.summary.total_tax_benefit),
        extra_income: money(m.projectedIncome),
        pds_yield_rate: percent(m.accumulationYield),
        step1: steps[0],
        step2: steps[1],
        step3: steps[2],
        step4: steps[3],
        step5: steps[4],
        // passive extras
        capital_growth_total: money(m.totalCapital),
        goal_inflation_rate: percent(m.inflation),
        ndfl_rate: '13%',
        next_months_contribution: moneyPerMonth(m.monthly),
        pds_gov_addon_year: money(36000),
        pds_insurance_cap: money(2800000),
        pds_tax_deduction_cap: money(400000),
        pds_tax_deduction_pct: '13%',
        plan_review_months: '12',
        gov_cofinancing_2025: money(m.planFacts.cofinancingAmount),
        tax_deduction_2026: money(m.planFacts.taxDeductionAmount),
    };
}

function kindTitle(kind) {
    switch (kind) {
        case 'capital':
            return 'Накопление капитала';
        case 'flat':
            return 'Квартира';
        case 'passive':
            return 'Пассивный доход';
        case 'child':
            return 'Детский капитал';
        case 'moon':
            return 'Разное';
        default:
            return 'Цель';
    }
}

function buildSteps(m, kind) {
    const open = 'Открыть договор ПДС';
    const initial = `Внести первоначальный взнос ${money(m.initial)}`;
    const monthly = `Ежемесячно пополнять ${moneyPerMonth(m.monthly)}`;
    const wait = `Дождаться ${yearLabel(m.targetYear)}`;
    const use =
        kind === 'passive'
            ? 'Начать получать пассивный доход'
            : kind === 'flat'
              ? 'Использовать накопления для покупки жилья'
              : kind === 'child'
                ? 'Использовать капитал на цели ребёнка'
                : 'Воспользоваться накопленным капиталом';
    return [open, initial, monthly, wait, use];
}

function tailPlaceholders(primaryMetrics, common, report) {
    const m = primaryMetrics;
    const s = m.summary || {};
    const total = m.totalCapital || 0;
    const monthly = m.monthly || 0;
    const yieldPct = m.accumulationYield || 0;
    const riskShare = pickPositive(s.risk_share_pct, s.equity_share_pct, 30);
    const passiveToday = pickPositive(
        s.projected_pension_monthly_present,
        s.monthly_income_present,
        total > 0 ? (total * (m.payoutYield / 100)) / 12 / Math.pow(1 + m.inflation / 100, m.yearsTo || 1) : 0
    );
    const passiveFuture = pickPositive(
        s.projected_pension_monthly_future,
        s.monthly_income_future,
        total > 0 ? (total * (m.payoutYield / 100)) / 12 : 0
    );

    const scheduleRows = m.schedule || [];
    const contribRows = scheduleRows.filter((r) => toNum(r.replenishment) > 0).slice(0, 5);

    return {
        ...buildPlanPlaceholders(m, common),
        portfolio_intro_text:
            'Ваш портфель сформирован с учётом горизонта цели, допустимого риска и продуктов партнёров программы долгосрочных сбережений.',
        portfolio_yield: percent(yieldPct),
        projected_total: money(total),
        projected_year: yearLabel(m.targetYear),
        next_contribution: moneyPerMonth(monthly),
        npf_yield_last_year: percent(yieldPct),
        npf_yield_year: String(new Date().getFullYear() - 1),
        passive_income_inflation: moneyPerMonth(passiveFuture),
        passive_income_rate: percent(m.payoutYield),
        passive_income_today: moneyPerMonth(passiveToday),
        risk_share_pct: percent(riskShare),
        withdrawal_age_f: '60',
        withdrawal_age_m: '65',
        withdrawal_years: String(Math.max(Math.round(m.yearsTo || 0), 0) || '—'),
        // allocation (lumpsum)
        allocation_instrument: 'ПДС (НПФ)',
        allocation_rate: percent(yieldPct),
        allocation_share_pct: '100%',
        allocation_sum: money(m.initial || total),
        allocation_donut_total: money(m.initial || total),
        // monthly allocation
        monthly_allocation_instrument: 'ПДС (НПФ)',
        monthly_allocation_rate: percent(yieldPct),
        monthly_allocation_share_pct: '100%',
        monthly_allocation_sum: moneyPerMonth(monthly),
        monthly_donut_total: moneyPerMonth(monthly),
        // funds marketing (defaults — can be overridden later)
        fund1_name: 'Ренессанс Накопления',
        fund1_description:
            'Программа долгосрочных сбережений с государственной поддержкой, налоговым вычетом и софинансированием.',
        fund1_ipo_text: 'Надёжный партнёр программы ПДС',
        fund1_stat1: percent(yieldPct),
        fund1_stat2: money(2800000),
        fund1_stat3: 'АСВ',
        fund1_yield_value: percent(yieldPct),
        fund1_yield_year: String(new Date().getFullYear() - 1),
        fund2_name: 'Партнёрская линейка фондов',
        fund2_description: 'Диверсификация через инструменты с защитой капитала и рыночной доходностью.',
        fund2_benefit_pct: percent(riskShare),
        fund2_history_years: '10+',
        fund2_insurance_cap: money(2800000),
        fund2_license: 'Лицензия ЦБ РФ',
        fund2_yield_value: percent(yieldPct),
        fund2_yield_year: String(new Date().getFullYear() - 1),
        fund3_name: 'Альфа НПФ',
        fund3_group: 'Альфа-Групп',
        fund3_description: 'Крупный негосударственный пенсионный фонд с широкой продуктовой линейкой.',
        fund3_point1: 'Государственная система гарантирования',
        fund3_point2: 'Прозрачная инвестиционная политика',
        fund3_point3: 'Цифровой личный кабинет',
        fund3_point4: 'Опыт работы на рынке НПФ',
        fund3_point5: 'Контроль Банка России',
        fund3_point6: 'Клиентский сервис 24/7',
        // inflation table (macro if present)
        inflation_intro_text:
            'Инфляция снижает покупательную способность денег. Долгосрочный план учитывает рост цен и помогает сохранить реальный уровень жизни.',
        ...buildInflationRows(report),
        // schedule
        schedule_intro_text:
            'Ниже — ориентир достижения цели. В реальности цифры могут отличаться от прогноза. Важно регулярно пересматривать план.',
        schedule_row1_contribution: money(contribRows[0]?.replenishment ?? monthly),
        schedule_row2_contribution: money(contribRows[1]?.replenishment ?? monthly),
        schedule_row3_contribution: money(contribRows[2]?.replenishment ?? monthly),
        schedule_row4_contribution: money(contribRows[3]?.replenishment ?? monthly),
    };
}

function buildInflationRows(report) {
    // Prefer macro series if ever attached; else fixed educational defaults from Figma-like samples
    const defaults = [
        { period: '2000–2005', inflation: '12%', yield: '8%' },
        { period: '2005–2010', inflation: '9%', yield: '10%' },
        { period: '2010–2015', inflation: '7%', yield: '9%' },
        { period: '2015–2020', inflation: '5%', yield: '8%' },
        { period: '2020–2025', inflation: '7%', yield: '11%' },
        { period: 'Прогноз', inflation: '5%', yield: '10%' },
    ];
    const out = {};
    defaults.forEach((row, i) => {
        const n = i + 1;
        out[`infl_row${n}_period`] = row.period;
        out[`infl_row${n}_inflation`] = row.inflation;
        out[`infl_row${n}_yield`] = row.yield;
    });
    return out;
}

function placeholdersForGoal(goal, common, goalIndex = 1) {
    const kind = resolveYadroGoalKind(goal?.goal_type, goal?.goal_name);
    const m = goalCoreMetrics(goal, common);
    if (kind === 'pension') {
        return { kind, metrics: m, values: pensionPlaceholders(m, common, goalIndex) };
    }
    return { kind, metrics: m, values: genericGoalPlaceholders(m, common, kind, goalIndex) };
}

module.exports = {
    resolveYadroGoalKind,
    commonContextFromReport,
    goalCoreMetrics,
    coverPlaceholders,
    placeholdersForGoal,
    tailPlaceholders,
    goalTitleNumbered,
};
