/**
 * ИФУС (индекс финансовой устойчивости семьи) для страницы «Управленческий вывод» Finam v2.
 * Опирается на docs/ifus_financial_stability_index_methodology_ru.md (базовые 7 факторов + критические штрафы).
 * Входы — snapshot отчёта после расчёта (family_page_ai_context, цели, current_situation).
 */

const WEIGHTS = Object.freeze({
    reserve: 0.25,
    dsr: 0.2,
    scf: 0.2,
    life: 0.15,
    netWorth: 0.1,
    housing: 0.05,
    goals: 0.05,
});

/**
 * Маппинг полей PFP → факторы ИФУС (для QA и поддержки).
 * @type {ReadonlyArray<{field: string, source: string, factor: string}>}
 */
const IFUS_FIELD_MAPPING = Object.freeze([
    { field: 'family_page_ai_context.cashflow_monthly_rub.income', source: 'Доход семьи (клиент + супруг)', factor: 'scf, dsr (знаменатель)' },
    { field: 'family_page_ai_context.cashflow_monthly_rub.obligations_total', source: 'Семейные обязательства', factor: 'reserve (знаменатель), scf' },
    { field: 'family_page_ai_context.cashflow_monthly_rub.planned_pfp_contributions', source: 'Взносы по целям ПФП', factor: 'scf, goals' },
    { field: 'family_profile.family_obligations (loans, mortgage)', source: 'Платежи по кредитам', factor: 'dsr' },
    { field: 'current_situation.assets_breakdown + goals FIN_RESERVE', source: 'Ликвидные активы / цель резерва', factor: 'reserve' },
    { field: 'goals LIFE.target_amount', source: 'Страховая сумма НСЖ', factor: 'life' },
    { field: 'current_situation.net_worth', source: 'Активы − долги', factor: 'netWorth' },
    { field: 'family_profile.children', source: 'Дети → целевой резерв, штраф без LIFE', factor: 'reserve target, penalties' },
    { field: 'family_profile.real_estate / obligations rent', source: 'Жильё', factor: 'housing' },
]);

/**
 * Чеклист заполнения карточки клиента перед расчётом отчёта v2 (страница ИФУС).
 * @type {ReadonlyArray<{id: string, label: string, required: boolean}>}
 */
const IFUS_DATA_CHECKLIST = Object.freeze([
    { id: 'income', label: 'avg_monthly_income (+ spouse в family_profile или spouse_avg_monthly_income)', required: true },
    { id: 'obligations', label: 'family_profile.family_obligations (аренда, ипотека, алименты и т.д.)', required: true },
    { id: 'fin_reserve', label: 'Цель FIN_RESERVE или ликвидные активы в assets_breakdown', required: false },
    { id: 'life', label: 'Цель LIFE (НСЖ) с target_amount — особенно при детях', required: false },
    { id: 'children', label: 'family_profile.children или tax_children', required: false },
    { id: 'liabilities', label: 'client_liabilities или obligations loans/mortgage для DSR', required: false },
]);

function toFinite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
}

/** Линейная интерполяция между (x0,y0) и (x1,y1); вне диапазона — clamp к концам. */
function piecewiseFromAnchors(x, anchors) {
    const sorted = anchors.slice().sort((a, b) => a[0] - b[0]);
    if (sorted.length === 0) return 0;
    if (x <= sorted[0][0]) return sorted[0][1];
    for (let i = 1; i < sorted.length; i++) {
        const [x0, y0] = sorted[i - 1];
        const [x1, y1] = sorted[i];
        if (x <= x1) {
            if (x1 === x0) return y1;
            const t = (x - x0) / (x1 - x0);
            return y0 + t * (y1 - y0);
        }
    }
    return sorted[sorted.length - 1][1];
}

/** Резерв: месяцы покрытия обязательных расходов → балл 0–10 */
function scoreReserveMonths(months) {
    const m = toFinite(months, 0);
    return piecewiseFromAnchors(m, [
        [0, 0],
        [1, 2],
        [3, 5],
        [6, 8],
        [12, 10],
        [36, 10],
    ]);
}

/** DSR доля 0–1 → балл (выше DSR — ниже балл) */
function scoreDsrRatio(dsr) {
    const d = clamp(toFinite(dsr, 0), 0, 1.2);
    return piecewiseFromAnchors(d, [
        [0, 10],
        [0.2, 10],
        [0.3, 7],
        [0.4, 5],
        [0.5, 3],
        [0.7, 0],
        [1, 0],
    ]);
}

/** SCFR доля 0–1+ → балл */
function scoreScfr(scfr) {
    const s = toFinite(scfr, 0);
    return piecewiseFromAnchors(s, [
        [-0.5, 0],
        [0, 2],
        [0.05, 4],
        [0.1, 6],
        [0.2, 8],
        [0.3, 10],
        [0.6, 10],
    ]);
}

/** Покрытие страхования 0–2+ → балл */
function scoreLifeCoverage(coverage) {
    const c = clamp(toFinite(coverage, 0), 0, 3);
    return piecewiseFromAnchors(c, [
        [0, 0],
        [0.25, 3],
        [0.5, 5],
        [1, 8],
        [1.5, 10],
        [3, 10],
    ]);
}

/** NWR = NW / годовой доход */
function scoreNetWorthRatio(nwr) {
    const n = toFinite(nwr, 0);
    return piecewiseFromAnchors(n, [
        [-1, 0],
        [0, 3],
        [1, 5],
        [3, 8],
        [5, 10],
        [20, 10],
    ]);
}

/** GoalRatio 0–1+ */
function scoreGoalRatio(ratio) {
    const r = clamp(toFinite(ratio, 0), 0, 2);
    return piecewiseFromAnchors(r, [
        [0, 0],
        [0.5, 4],
        [0.75, 7],
        [1, 10],
        [1.5, 10],
    ]);
}

function sumLiquidFromAssetsBreakdown(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const re = /депозит|наличн|брокер|iis|иис|накоп|сч[ёе]т|ликвид|money|cash|deposit|broker/i;
    let sum = 0;
    for (const row of list) {
        const name = String(row?.name || '');
        if (re.test(name)) sum += toFinite(row?.value, 0);
    }
    return sum;
}

function pickLifeGoal(goals) {
    const list = Array.isArray(goals) ? goals : [];
    return list.find((g) => String(g?.goal_type || '').toUpperCase() === 'LIFE' || Number(g?.goal_type_id) === 5) || null;
}

function pickFinReserveGoal(goals) {
    const list = Array.isArray(goals) ? goals : [];
    return list.find((g) => String(g?.goal_type || '').toUpperCase() === 'FIN_RESERVE' || Number(g?.goal_type_id) === 7) || null;
}

function monthlyDebtPayments(familyObligations, liabilitiesTotal, income) {
    const obs = Array.isArray(familyObligations) ? familyObligations : [];
    let fromProfile = 0;
    for (const o of obs) {
        const t = String(o?.type || '').toLowerCase();
        if (t === 'loans' || t === 'mortgage') fromProfile += toFinite(o?.amount_monthly, 0);
    }
    if (fromProfile > 0) return fromProfile;
    const lt = toFinite(liabilitiesTotal, 0);
    if (lt > 0 && income > 0) return Math.min(income * 0.45, lt / 120);
    return 0;
}

function mandatoryMonthlyExpenses(obligationsTotal, income) {
    const ob = toFinite(obligationsTotal, 0);
    if (ob > 0) return Math.max(ob, 1);
    if (income > 0) return Math.max(1, income * 0.55);
    return 1;
}

function liquidReserveRub({ goals, assetsBreakdown, netWorth }) {
    const reserveGoal = pickFinReserveGoal(goals);
    const fromGoal = reserveGoal
        ? toFinite(
            reserveGoal?.summary?.initial_capital ??
                reserveGoal?.smart_initial_capital ??
                reserveGoal?.initial_capital,
            0
        )
        : 0;
    const fromBreakdown = sumLiquidFromAssetsBreakdown(assetsBreakdown);
    const combined = Math.max(fromBreakdown, fromGoal);
    if (combined > 0) return combined;
    return Math.max(0, toFinite(netWorth, 0) * 0.08);
}

function reserveTargetMonths({ childrenCount, hasMortgageObligation, singleBreadwinner }) {
    if (hasMortgageObligation && singleBreadwinner && childrenCount > 0) return 10;
    if (hasMortgageObligation && childrenCount > 0) return 9;
    if (childrenCount > 0) return 6;
    return 3.5;
}

function housingScore({ familyObligations, liabilitiesTotal, netWorth }) {
    const obs = Array.isArray(familyObligations) ? familyObligations : [];
    const hasRent = obs.some((o) => String(o?.type || '').toLowerCase() === 'rent');
    const hasMortgage = obs.some((o) => String(o?.type || '').toLowerCase() === 'mortgage');
    const lt = toFinite(liabilitiesTotal, 0);
    const nw = toFinite(netWorth, 0);
    if (!hasMortgage && lt <= 0 && nw > 0) return 10;
    if (hasRent && lt > nw * 0.25) return 2;
    if (hasMortgage && lt > nw * 0.45) return 3;
    if (hasMortgage && lt > nw * 0.2) return 6;
    if (hasMortgage) return 8;
    if (hasRent) return 6;
    return 7;
}

function interpretationBand(total) {
    const t = clamp(toFinite(total, 0), 0, 10);
    if (t < 3) return { id: 'critical', label: 'Критическое финансовое состояние', range: '0–2,9' };
    if (t < 5) return { id: 'unstable', label: 'Финансовая нестабильность', range: '3–4,9' };
    if (t < 7) return { id: 'ok', label: 'Удовлетворительная устойчивость', range: '5–6,9' };
    if (t < 8.5) return { id: 'high', label: 'Высокая устойчивость', range: '7–8,4' };
    return { id: 'max', label: 'Максимальная финансовая устойчивость', range: '8,5–10' };
}

function formatScoreRu(total) {
    return clamp(toFinite(total, 0), 0, 10).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/**
 * @param {object} params
 * @param {object} params.report — сырой объект отчёта (как в reportService.getClientReportData)
 * @param {object} params.v2 — уже собранный фрагмент v2: goals, cashflowDiagnostics, goalsDiagnostics, currentState, portfolio
 */
function buildIfusFromReportModel({ report, v2 }) {
    const goals = Array.isArray(v2?.goals) ? v2.goals : [];
    const cash = v2?.cashflowDiagnostics || {};
    const gd = v2?.goalsDiagnostics || {};
    const cs = v2?.currentState || {};
    const portfolio = v2?.portfolio || {};

    const income = toFinite(cash.income, 0);
    const obligationsTotal = toFinite(cash.obligations, 0);
    const planned = toFinite(cash.plannedContributions, 0);
    const free = toFinite(cash.freeCashflow, 0);
    const freeRatio = Number.isFinite(cash.freeCashflowRatio) ? cash.freeCashflowRatio : income > 0 ? free / income : 0;
    const goalLoad = Number.isFinite(gd?.goalLoadRatio) ? gd.goalLoadRatio : income > 0 ? planned / income : 0;

    const familyCtx = report?.family_page_ai_context || {};
    const family = familyCtx.family || {};
    const familyObligations = family.family_obligations || [];
    const children = Array.isArray(family.children) ? family.children : [];
    const childrenCount = children.length;
    const spouseInc = toFinite(familyCtx?.cashflow_monthly_rub?.income_spouse_included, 0);
    const singleBreadwinner = income > 0 && spouseInc < income * 0.08;

    const liabilitiesTotal = toFinite(cs.liabilitiesTotal ?? report?.current_situation?.liabilities_total, 0);
    const netWorth = toFinite(cs.netWorth ?? report?.current_situation?.net_worth, 0);
    const assetsBreakdown = cs.assetsBreakdown || report?.current_situation?.assets_breakdown || [];

    const mandatory = mandatoryMonthlyExpenses(obligationsTotal, income);
    const monthlyDebt = monthlyDebtPayments(familyObligations, liabilitiesTotal, income);
    const netIncomeApprox = income > 0 ? income * 0.87 : 0;
    const dsrDenom = netIncomeApprox > 0 ? netIncomeApprox : Math.max(income, 1);
    const dsr = monthlyDebt / dsrDenom;

    const liquid = liquidReserveRub({ goals, assetsBreakdown, netWorth });
    const reserveMonths = liquid / mandatory;
    const sReserve = scoreReserveMonths(reserveMonths);
    const sDsr = scoreDsrRatio(dsr);
    const sScf = scoreScfr(freeRatio);

    const annualMandatory = mandatory * 12;
    const needLife = annualMandatory * 10 + liabilitiesTotal;
    const lifeGoal = pickLifeGoal(goals);
    const lifeLimit = toFinite(lifeGoal?.target_amount ?? lifeGoal?.summary?.expected_cash_value, 0);
    const coverage = needLife > 0 && lifeLimit > 0 ? lifeLimit / needLife : 0;
    const sLife = lifeGoal ? scoreLifeCoverage(coverage) : 0;

    const annualIncome = income * 12;
    const nwr = annualIncome > 0 ? netWorth / annualIncome : 0;
    const sNw = scoreNetWorthRatio(nwr);

    const hasMortgageObligation = familyObligations.some((o) => String(o?.type || '').toLowerCase() === 'mortgage');
    const sHouse = housingScore({ familyObligations, liabilitiesTotal, netWorth });

    const impliedGoalRatio = clamp(1.15 - goalLoad * 1.2, 0, 1.2);
    const sGoals = scoreGoalRatio(impliedGoalRatio);

    const base =
        WEIGHTS.reserve * sReserve +
        WEIGHTS.dsr * sDsr +
        WEIGHTS.scf * sScf +
        WEIGHTS.life * sLife +
        WEIGHTS.netWorth * sNw +
        WEIGHTS.housing * sHouse +
        WEIGHTS.goals * sGoals;

    const penalties = [];
    let penSum = 0;
    if (reserveMonths < 1 && mandatory > 0) {
        penalties.push({ code: 'reserve_lt1m', amount: 1.5, label: 'Резерв менее 1 месяца расходов' });
        penSum += 1.5;
    }
    if (free < 0) {
        penalties.push({ code: 'scf_negative', amount: 2, label: 'Отрицательный свободный денежный поток' });
        penSum += 2;
    }
    if (dsr > 0.6) {
        penalties.push({ code: 'dsr_high', amount: 2, label: 'DSR выше 60%' });
        penSum += 2;
    }
    if (!lifeGoal && childrenCount > 0) {
        penalties.push({ code: 'life_missing_children', amount: 2, label: 'Нет страховой защиты жизни при наличии детей' });
        penSum += 2;
    }

    const total = clamp(base - penSum, 0, 10);
    const band = interpretationBand(total);
    const targetReserveMonths = reserveTargetMonths({ childrenCount, hasMortgageObligation, singleBreadwinner });

    const factors = [
        {
            id: 'reserve',
            title: 'Финансовый резерв',
            weight: WEIGHTS.reserve,
            score: sReserve,
            contribution: WEIGHTS.reserve * sReserve,
            detail: `${reserveMonths.toFixed(1)} мес. расходов при оценке обязательных ${Math.round(mandatory).toLocaleString('ru-RU')} ₽/мес.`,
        },
        {
            id: 'dsr',
            title: 'Долговая нагрузка (DSR)',
            weight: WEIGHTS.dsr,
            score: sDsr,
            contribution: WEIGHTS.dsr * sDsr,
            detail: `Платежи по кредитам ~${Math.round(monthlyDebt).toLocaleString('ru-RU')} ₽ к доходу ~${Math.round(dsrDenom).toLocaleString('ru-RU')} ₽/мес (после НДФЛ оценочно).`,
        },
        {
            id: 'scf',
            title: 'Свободный cash flow',
            weight: WEIGHTS.scf,
            score: sScf,
            contribution: WEIGHTS.scf * sScf,
            detail: `Доля свободного потока после обязательств и ПФП: ${(freeRatio * 100).toFixed(1)}%.`,
        },
        {
            id: 'life',
            title: 'Страховая защита жизни',
            weight: WEIGHTS.life,
            score: sLife,
            contribution: WEIGHTS.life * sLife,
            detail: lifeGoal
                ? `Покрытие потребности оценочно ${(coverage * 100).toFixed(0)}% (страховая сумма к расчётной потребности).`
                : 'В плане не выделена цель защиты жизни (НСЖ/страхование).',
        },
        {
            id: 'netWorth',
            title: 'Чистый капитал',
            weight: WEIGHTS.netWorth,
            score: sNw,
            contribution: WEIGHTS.netWorth * sNw,
            detail: `Чистый капитал ${Math.round(netWorth).toLocaleString('ru-RU')} ₽ к годовому доходу ${Math.round(annualIncome).toLocaleString('ru-RU')} ₽.`,
        },
        {
            id: 'housing',
            title: 'Жилищная устойчивость',
            weight: WEIGHTS.housing,
            score: sHouse,
            contribution: WEIGHTS.housing * sHouse,
            detail: 'Оценка по профилю обязательств и долгу.',
        },
        {
            id: 'goals',
            title: 'Защищённость финансовых целей',
            weight: WEIGHTS.goals,
            score: sGoals,
            contribution: WEIGHTS.goals * sGoals,
            detail: `Нагрузка взносами на доход ~${(goalLoad * 100).toFixed(1)}%.`,
        },
    ];

    const dataGaps = [];
    if (obligationsTotal <= 0 && income > 0) dataGaps.push('Семейные обязательства в профиле не заполнены — обязательные расходы оценены консервативно.');
    if (!lifeGoal) dataGaps.push('Нет цели LIFE — блок страхования отражает отсутствие контура в плане.');
    if (sumLiquidFromAssetsBreakdown(assetsBreakdown) <= 0 && !pickFinReserveGoal(goals)) dataGaps.push('Ликвидность оценена по косвенным признакам (нет явной разбивки ликвидных активов).');

    const alerts = [];
    if (!lifeGoal) {
        alerts.push({
            level: childrenCount > 0 ? 'danger' : 'warn',
            text: childrenCount > 0
                ? 'В плане не выделена защита жизни — при наличии детей это критичный разрыв контура.'
                : 'В плане не выделена защита жизни — стоит отдельно оценить покрытие риска.',
        });
    }
    if (reserveMonths < targetReserveMonths - 0.01) {
        const targetLabel =
            targetReserveMonths >= 9 ? '9–12' : targetReserveMonths >= 6 ? '6' : '3–4';
        alerts.push({
            level: reserveMonths < 3 ? 'warn' : 'info',
            text: `Резерв ~${reserveMonths.toFixed(1)} мес. обязательных расходов — по профилю семьи ориентир ${targetLabel} мес.`,
        });
    }

    return {
        totalScore: total,
        totalScoreFormatted: formatScoreRu(total),
        baseScore: base,
        penalties,
        penaltySum: penSum,
        band,
        reserveMonths,
        reserveMonthsFormatted: reserveMonths.toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
        targetReserveMonths,
        liquidRub: liquid,
        mandatoryMonthlyRub: mandatory,
        monthlyDebtRub: monthlyDebt,
        dsr,
        dsrPercentFormatted: (dsr * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
        freeCashflowRatio: freeRatio,
        lifeCoverageRatio: coverage,
        hasLifeGoal: !!lifeGoal,
        factors,
        dataGaps,
        alerts,
        projectedCapitalLabel: portfolio?.projectedTotal
            ? `${(portfolio.projectedTotal / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`
            : '—',
    };
}

module.exports = {
    buildIfusFromReportModel,
    WEIGHTS,
    IFUS_FIELD_MAPPING,
    IFUS_DATA_CHECKLIST,
};
