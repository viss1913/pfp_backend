const fs = require('fs');
const path = require('path');
const {
    FINAM_REPORT_V2_PAGE_TYPES,
    FINAM_REPORT_V2_SCHEMA_VERSION,
} = require('./finamReportV2Contract');
const {
    buildFinamV2TemplatePackage,
    buildFinamV2TemplatePageHtml,
} = require('./finamV2PageComposer');

const FINAM_V2_DIR = __dirname;

const GOAL_TYPE_TO_PAGE_TYPE = Object.freeze({
    FIN_RESERVE: FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
    LIFE: FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
    PENSION: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION,
    PASSIVE_INCOME: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
    RENT: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
    INVESTMENT: FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
    OTHER: FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
});

const PAGE_TITLES = Object.freeze({
    [FINAM_REPORT_V2_PAGE_TYPES.COVER]: 'Обложка',
    [FINAM_REPORT_V2_PAGE_TYPES.INTRO]: 'Введение',
    [FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE]: 'Текущее состояние',
    [FINAM_REPORT_V2_PAGE_TYPES.GOALS]: 'Портфель целей',
    [FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY]: 'Управленческий вывод',
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE]: 'Финансовый резерв',
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE]: 'Защита жизни',
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION]: 'Пенсионная цель',
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME]: 'Пассивный доход',
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW]: 'Сохранить и приумножить',
    [FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER]: 'Крупная цель',
    [FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY]: 'Итоговый портфель',
    [FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING]: 'Налоговое планирование',
    [FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW]: 'Автоследование Comon',
    [FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES]: 'Стратегии ДУ',
    [FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS]: 'Предложения Финам',
    [FINAM_REPORT_V2_PAGE_TYPES.INFLATION]: 'Макроконтур',
    [FINAM_REPORT_V2_PAGE_TYPES.ROADMAP]: 'Дорожная карта',
    [FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN]: 'Подробный план',
    [FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION]: 'Декларация о рисках',
    [FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE]: 'Партнёрская ценность',
});

const ASSET_BY_GOAL_TYPE = Object.freeze({
    FIN_RESERVE: 'goal-reserve.webp',
    LIFE: 'goal-lifeinsurance.webp',
    PENSION: 'goal-pension.webp',
    PASSIVE_INCOME: 'goal-passive-income.webp',
    RENT: 'goal-passive-income.webp',
    INVESTMENT: 'goal-save-grow.webp',
    OTHER: 'goal-other.webp',
});

function readLocalCss(fileName) {
    return fs.readFileSync(path.join(FINAM_V2_DIR, fileName), 'utf8');
}

function mimeTypeForLocalFile(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    const map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };
    return map[ext] || 'application/octet-stream';
}

function localAssetDataUrl(relativePath) {
    const abs = path.join(FINAM_V2_DIR, relativePath);
    if (!fs.existsSync(abs)) return null;
    const buf = fs.readFileSync(abs);
    return `data:${mimeTypeForLocalFile(abs)};base64,${buf.toString('base64')}`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function toFiniteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value, { perMonth = false, short = false } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    let formatted;
    if (short && abs >= 1000000) {
        formatted = `${(n / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
    } else if (short && abs >= 1000) {
        formatted = `${Math.round(n / 1000).toLocaleString('ru-RU')} тыс. ₽`;
    } else {
        formatted = `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    }
    return perMonth ? `${formatted}/мес` : formatted;
}

function formatPercent(value, fallback = '—') {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatDateRu(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: process.env.REPORT_PDF_TZ || 'Europe/Moscow',
        }).format(date);
    } catch (_) {
        return new Date(date).toISOString().slice(0, 10);
    }
}

function stripMarkdown(value) {
    return String(value || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#>*_`-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function paragraphsFromText(value, limit = 3) {
    const text = String(value || '').trim();
    if (!text) return [];
    const blocks = text
        .split(/\n{2,}|\r?\n(?=\S)/)
        .map(stripMarkdown)
        .filter(Boolean);
    return (blocks.length ? blocks : [stripMarkdown(text)]).slice(0, limit);
}

function goalType(goal) {
    return String(goal?.goal_type || '').toUpperCase();
}

function goalTypeId(goal) {
    const n = Number(goal?.goal_type_id);
    return Number.isFinite(n) ? n : null;
}

function goalDisplayName(goal) {
    return goal?.goal_title_raw || goal?.goal_name || goal?.name || PAGE_TITLES[GOAL_TYPE_TO_PAGE_TYPE[goalType(goal)]] || 'Цель';
}

function goalPageType(goal) {
    const type = goalType(goal);
    const id = goalTypeId(goal);
    if (type === 'PASSIVE_INCOME' || type === 'RENT' || id === 2 || id === 8) {
        return FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME;
    }
    return GOAL_TYPE_TO_PAGE_TYPE[type] || FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER;
}

function normalizeGoalFilter(goalTypesRaw) {
    if (!goalTypesRaw) return null;
    const valid = new Set(['FIN_RESERVE', 'LIFE', 'PENSION', 'PASSIVE_INCOME', 'RENT', 'INVESTMENT', 'OTHER']);
    const items = String(goalTypesRaw)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => valid.has(s));
    return items.length ? new Set(items) : null;
}

function filterGoals(goals, goalTypesRaw) {
    const list = Array.isArray(goals) ? goals : [];
    const filter = normalizeGoalFilter(goalTypesRaw);
    if (!filter) return list.slice();
    return list.filter((goal) => {
        const type = goalType(goal);
        const id = goalTypeId(goal);
        if (filter.has(type)) return true;
        if ((id === 2 || id === 8) && (filter.has('PASSIVE_INCOME') || filter.has('RENT'))) return true;
        return false;
    });
}

function riskProfileLabel(goal) {
    const extended = goal?.risk_profile_extended || goal?.risk_profile_details?.risk_profile_extended;
    const isExtended = extended !== undefined && extended !== null && String(extended).trim();
    const raw =
        extended ||
        goal?.risk_profile_details?.risk_profile ||
        goal?.risk_profile;
    const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!value) return 'По анкете клиента';
    if (value === '1') return 'Консервативный';
    if (value === '2') return isExtended ? 'Умеренно-консервативный' : 'Сбалансированный';
    if (value === '3') return isExtended ? 'Сбалансированный' : 'Агрессивный';
    if (value === '4') return 'Умеренно агрессивный';
    if (value === '5') return 'Агрессивный';
    if (value.includes('moderately_conservative') || value.includes('moderate_conservative') || /умер.*консер/.test(value)) return 'Умеренно-консервативный';
    if (value.includes('conservative') || /консервативн/.test(value) || value === 'low') return 'Консервативный';
    if (value.includes('balanced') || value === 'moderate' || value === 'medium' || /сбаланс/.test(value) || /умеренны[ий]/.test(value)) return 'Сбалансированный';
    if (value.includes('moderately_aggressive') || value.includes('moderate_aggressive') || /умер.*агрессив/.test(value)) return 'Умеренно агрессивный';
    if (value.includes('aggressive') || value === 'high' || /агрессив/.test(value)) return 'Агрессивный';
    return String(raw);
}

function pickGoalTarget(goal) {
    const summary = goal?.summary || {};
    return (
        summary.target_amount_future ??
        summary.projected_capital_at_end ??
        summary.projected_capital_at_retirement ??
        summary.total_capital_at_end ??
        summary.expected_cash_value ??
        goal?.target_amount ??
        0
    );
}

function pickGoalCostNow(goal) {
    const summary = goal?.summary || {};
    return (
        summary.target_amount_initial ??
        summary.target_amount_now ??
        summary.current_cost ??
        summary.cost_now ??
        goal?.target_amount_initial ??
        goal?.current_cost ??
        0
    );
}

function pickGoalCostFuture(goal) {
    const summary = goal?.summary || {};
    return (
        summary.target_amount_future ??
        summary.target_amount_with_inflation ??
        summary.future_cost ??
        goal?.target_amount_future ??
        pickGoalTarget(goal)
    );
}

function pickGoalCapital(goal) {
    const summary = goal?.summary || {};
    return (
        summary.projected_capital_at_end ??
        summary.projected_capital_at_retirement ??
        summary.total_capital_at_end ??
        summary.target_capital ??
        summary.expected_cash_value ??
        summary.initial_capital ??
        goal?.target_capital ??
        0
    );
}

function pickGoalInitial(goal) {
    return goal?.summary?.initial_capital ?? goal?.smart_initial_capital ?? goal?.initial_capital ?? 0;
}

function pickGoalMonthly(goal) {
    return goal?.summary?.monthly_replenishment ?? goal?.monthly_replenishment ?? 0;
}

function pickGoalTerm(goal) {
    const months = toFiniteNumber(goal?.summary?.target_months ?? goal?.summary?.term_months ?? goal?.term_months, 0);
    if (months <= 0) return '—';
    const years = Math.round(months / 12);
    return years > 0 ? `${years} лет` : `${months} мес.`;
}

function goalSortWeight(goal) {
    const pageType = goalPageType(goal);
    const order = [
        FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
        FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
        FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION,
        FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
        FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
        FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
    ];
    const idx = order.indexOf(pageType);
    return idx >= 0 ? idx : 999;
}

function groupGoals(goals) {
    const groups = [
        { id: 'protection', title: 'Защита', goals: [] },
        { id: 'savings', title: 'Накопления', goals: [] },
        { id: 'pension', title: 'Пенсия', goals: [] },
    ];
    for (const goal of goals) {
        const pageType = goalPageType(goal);
        if ([FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE, FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE].includes(pageType)) {
            groups[0].goals.push(goal);
        } else if ([FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION, FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME].includes(pageType)) {
            groups[2].goals.push(goal);
        } else {
            groups[1].goals.push(goal);
        }
    }
    return groups;
}

function goalMonths(goal) {
    return toFiniteNumber(goal?.summary?.target_months ?? goal?.summary?.term_months ?? goal?.term_months, 0);
}

function goalGroupId(goal) {
    const pageType = goalPageType(goal);
    if ([FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE, FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE].includes(pageType)) {
        return 'protection';
    }
    if ([FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION, FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME].includes(pageType)) {
        return 'pension';
    }
    return 'savings';
}

function buildCashflowDiagnostics({ income, obligations, plannedContributions, freeCashflow }) {
    const safeIncome = toFiniteNumber(income, 0);
    const freeCashflowRatio = safeIncome > 0 ? freeCashflow / safeIncome : null;
    const goalLoadRatio = safeIncome > 0 ? plannedContributions / safeIncome : null;
    let scenario = 'cashflow_unknown';
    if (freeCashflow < 0) scenario = 'cashflow_negative';
    else if (Number.isFinite(freeCashflowRatio) && freeCashflowRatio < 0.15) scenario = 'cashflow_thin';
    else if (Number.isFinite(freeCashflowRatio) && freeCashflowRatio < 0.30) scenario = 'cashflow_working';
    else if (Number.isFinite(freeCashflowRatio)) scenario = 'cashflow_strong';

    return {
        income: safeIncome,
        obligations: toFiniteNumber(obligations, 0),
        plannedContributions: toFiniteNumber(plannedContributions, 0),
        freeCashflow: toFiniteNumber(freeCashflow, 0),
        freeCashflowRatio,
        goalLoadRatio,
        scenario,
    };
}

function buildGoalsDiagnostics(goals, { income = 0, plannedContributions = 0 } = {}) {
    const rows = (Array.isArray(goals) ? goals : []).map((goal) => {
        const monthly = toFiniteNumber(pickGoalMonthly(goal), 0);
        const months = goalMonths(goal);
        const pageType = goalPageType(goal);
        return {
            goal,
            title: goalDisplayName(goal),
            pageType,
            groupId: goalGroupId(goal),
            groupTitle: pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION || pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME
                ? 'Пенсия'
                : goalGroupId(goal) === 'protection'
                    ? 'Защита'
                    : 'Накопления',
            term: pickGoalTerm(goal),
            months,
            monthly,
            capital: pickGoalCapital(goal),
            costNow: pickGoalCostNow(goal),
            costFuture: pickGoalCostFuture(goal),
        };
    });

    const totalMonthlyFromGoals = rows.reduce((sum, row) => sum + row.monthly, 0);
    const totalMonthly = totalMonthlyFromGoals || toFiniteNumber(plannedContributions, 0);
    const groups = groupGoals(goals).map((group) => {
        const groupRows = rows.filter((row) => row.groupId === group.id);
        const monthly = groupRows.reduce((sum, row) => sum + row.monthly, 0);
        const percent = totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0;
        return {
            id: group.id,
            title: group.title,
            monthly,
            percent,
            goals: groupRows.sort((a, b) => b.monthly - a.monthly),
        };
    });

    const sortedRows = rows.slice().sort((a, b) => b.monthly - a.monthly);
    const largestGoal = sortedRows[0] || null;
    const largestGroup = groups.slice().sort((a, b) => b.monthly - a.monthly)[0] || null;
    const longTermMonthly = rows
        .filter((row) => row.months >= 120 || row.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION)
        .reduce((sum, row) => sum + row.monthly, 0);
    const longTermShare = totalMonthly > 0 ? longTermMonthly / totalMonthly : 0;
    const goalLoadRatio = income > 0 ? totalMonthly / income : null;
    const hasReserve = rows.some((row) => row.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE);
    const hasLife = rows.some((row) => row.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE);
    const hasPension = rows.some((row) => row.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION || row.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME);

    const headline = !rows.length
        ? 'Портфель целей пока не сформирован'
        : largestGroup && largestGroup.percent >= 50
            ? `${largestGroup.title} формирует основную нагрузку портфеля целей`
            : goalLoadRatio != null && goalLoadRatio >= 0.45
                ? 'Портфель целей требует приоритизации по денежному потоку'
                : 'Портфель целей сбалансирован по ключевым блокам';
    const subline = !rows.length
        ? 'Чтобы собрать управленческий вывод, нужно добавить цели и параметры пополнений.'
        : goalLoadRatio != null
            ? `Цели требуют около ${formatPercent(goalLoadRatio * 100)} ежемесячного дохода; главный блок — ${largestGroup?.title || 'цели'}.`
            : `Совокупный ежемесячный ресурс по целям — ${formatMoney(totalMonthly, { perMonth: true, short: true })}.`;

    const insights = [
        largestGoal
            ? `${largestGoal.title} даёт максимальную нагрузку: ${formatMoney(largestGoal.monthly, { perMonth: true, short: true })}.`
            : 'Нет целей с регулярным пополнением.',
        longTermMonthly > 0
            ? `Долгосрочные цели забирают ${formatPercent(longTermShare * 100)} ежемесячного ресурса.`
            : 'Долгосрочная нагрузка пока не выделена.',
        hasPension
            ? 'Пенсионный блок нужно сверять со сценарием доходности и сроком.'
            : 'Пенсионная цель пока не выделена отдельным контуром.',
        hasReserve
            ? 'Резерв присутствует в плане и снижает риск кассового разрыва.'
            : 'Финансовый резерв стоит проверить до усиления инвестиционных целей.',
    ];

    const takeaways = [
        largestGoal
            ? `Основная нагрузка сосредоточена в цели «${largestGoal.title}» — её параметры стоит пересматривать первой.`
            : 'После добавления целей появится приоритет для первого пересчёта.',
        goalLoadRatio != null && goalLoadRatio >= 0.45
            ? 'Доля взносов высока относительно дохода: нужен порядок обязательных и опциональных целей.'
            : 'Доля взносов не выглядит критичной, если сохраняется дисциплина пополнений.',
        hasReserve && hasLife
            ? 'Защитный контур закрыт базовыми целями, можно управлять длинным капиталом.'
            : 'Перед ускорением долгих целей нужно проверить резерв и защиту жизни.',
    ];

    return {
        totalMonthly,
        totalMonthlyFromGoals,
        goalLoadRatio,
        groups,
        rows: sortedRows,
        tableRows: sortedRows.slice(0, 6),
        remainingCount: Math.max(0, sortedRows.length - 6),
        largestGoal,
        largestGroup,
        longTermShare,
        hasReserve,
        hasLife,
        hasPension,
        headline,
        subline,
        insights,
        takeaways,
    };
}

function buildExecutiveDecision({ cashflowDiagnostics, goalsDiagnostics, currentState, portfolio }) {
    const freeRatio = Number(cashflowDiagnostics.freeCashflowRatio);
    const goalLoadRatio = Number(goalsDiagnostics.goalLoadRatio ?? cashflowDiagnostics.goalLoadRatio);
    const reserveGap = !goalsDiagnostics.hasReserve;
    const protectionGap = reserveGap || (!goalsDiagnostics.hasLife && cashflowDiagnostics.obligations > 0);
    const pensionDominant = goalsDiagnostics.hasPension && goalsDiagnostics.largestGroup?.id === 'pension' && goalsDiagnostics.largestGroup.percent >= 40;

    let scenario = cashflowDiagnostics.scenario;
    if (cashflowDiagnostics.freeCashflow < 0) scenario = 'cashflow_negative';
    else if (Number.isFinite(goalLoadRatio) && goalLoadRatio >= 0.45) scenario = 'goal_overload';
    else if (protectionGap) scenario = 'protection_gap';
    else if (pensionDominant) scenario = 'retirement_gap';
    else if (Number.isFinite(freeRatio) && freeRatio < 0.15) scenario = 'cashflow_thin';
    else if (Number.isFinite(freeRatio) && freeRatio < 0.30) scenario = 'cashflow_working';
    else scenario = 'growth_ready';

    const freeCashflow = cashflowDiagnostics.freeCashflow;
    const freePct = Number.isFinite(freeRatio) ? formatPercent(freeRatio * 100) : '—';
    const loadPct = Number.isFinite(goalLoadRatio) ? formatPercent(goalLoadRatio * 100) : '—';
    const projected = formatMoney(portfolio.projectedTotal, { short: true }).replace(/\s*₽$/, '');
    const largestGoal = goalsDiagnostics.largestGoal?.title || 'ключевая цель';
    const largestGroup = goalsDiagnostics.largestGroup?.title || 'цели';
    const score = (() => {
        if (!Number.isFinite(freeRatio)) return '5,0';
        let value = cashflowDiagnostics.freeCashflow < 0 ? 2.2 : 4.2 + Math.min(Math.max(freeRatio, 0), 0.4) * 10;
        if (Number.isFinite(goalLoadRatio) && goalLoadRatio > 0.45) value -= 1.2;
        if (reserveGap) value -= 0.8;
        if (goalsDiagnostics.hasReserve && freeRatio >= 0.15) value += 0.5;
        return Math.max(1, Math.min(9.6, value)).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    })();

    const catalog = {
        cashflow_negative: {
            headline: 'План требует паузы: сначала закрыть кассовый разрыв',
            lead: 'Главный управленческий вопрос — не доходность, а восстановление положительного денежного потока после обязательств и взносов.',
            keyInsight: `При доходе ${formatMoney(cashflowDiagnostics.income)} и обязательствах ${formatMoney(cashflowDiagnostics.obligations)} план уходит в минус на ${formatMoney(Math.abs(freeCashflow))} в месяц. Новые цели лучше не добавлять до выравнивания бюджета.`,
            risk: ['Кассовый разрыв', formatMoney(Math.abs(freeCashflow), { short: true }), 'дефицит в месяц после обязательств и ПФП'],
            lever: ['Главный рычаг', '0-90 дней', 'сократить нагрузку и вернуть поток в плюс'],
            decisionRows: [
                ['Сократить нагрузку', 'Остановить рост дефицита и не продавать активы в плохой момент.', 'Пересчитать взносы и обязательства.'],
                ['Приоритизировать цели', 'Оставить только обязательные цели до выхода cash flow в плюс.', `Первой проверить «${largestGoal}».`],
                ['Зафиксировать контроль', 'Без контроля бюджет снова уйдёт в минус.', 'Сверять факт расходов ежемесячно.'],
            ],
            recommendedScenario: 'Первые 90 дней — восстановление положительного денежного потока. После этого — резерв и только затем долгосрочные цели.',
        },
        cashflow_thin: {
            headline: 'План возможен, если жёстко держать свободный поток',
            lead: 'Запас прочности есть, но он тонкий: любое увеличение обязательств или целей быстро ломает траекторию.',
            keyInsight: `После обязательств и ПФП остаётся ${formatMoney(freeCashflow)} — около ${freePct} дохода. Значит, план работает только через дисциплину и приоритизацию.`,
            risk: ['Тонкий запас', freePct, 'дохода остаётся после обязательств и ПФП'],
            lever: ['Главный рычаг', '12 мес', 'закрепить резерв и стабильность пополнений'],
            decisionRows: [
                ['Зафиксировать резерв', 'Снять риск кассового разрыва и не трогать долгие активы.', 'Держать пополнение резерва первым платежом.'],
                ['Разделить цели', 'Не перегрузить бюджет долгосрочными взносами.', 'Разнести обязательные и опциональные цели.'],
                ['Вести сценарии', 'Показать последствия стресса и роста дохода.', 'Пересматривать план раз в квартал.'],
            ],
            recommendedScenario: 'Первые 90 дней — защита бюджета и резерв. Следующие 12 месяцев — стабилизация пополнений, затем расширение инвестиционного блока.',
        },
        cashflow_working: {
            headline: 'План рабочий, если сохранить квартальный контроль',
            lead: 'Денежный поток выдерживает текущую структуру целей, но план должен пересчитываться при изменении дохода, обязательств или сроков.',
            keyInsight: `Свободный поток составляет ${formatMoney(freeCashflow)} — около ${freePct} дохода. Этого достаточно для планового движения без агрессивного ускорения.`,
            risk: ['Контроль', freePct, 'дохода остаётся после обязательств и ПФП'],
            lever: ['Главный рычаг', 'квартал', 'регулярно сверять факт пополнений'],
            decisionRows: [
                ['Сохранить взносы', 'План держится на регулярности, а не на разовых решениях.', 'Зафиксировать автоплатежи или календарь.'],
                ['Проверить сроки', 'Длинные цели чувствительны к просадкам и инфляции.', `Первой сверить группу «${largestGroup}».`],
                ['Держать сценарии', 'Решения принимаются по правилам, а не по эмоциям.', 'Обновлять расчёт раз в квартал.'],
            ],
            recommendedScenario: 'Базовый сценарий — сохранять текущий темп, раз в квартал проверять фактический поток и не увеличивать обязательства без пересчёта.',
        },
        goal_overload: {
            headline: 'Портфель целей перегружает ежемесячный ресурс',
            lead: 'Проблема не в количестве целей, а в доле дохода, которую они требуют каждый месяц.',
            keyInsight: `Взносы по целям занимают около ${loadPct} дохода. Главный блок нагрузки — ${largestGroup}, поэтому порядок целей важнее добавления новых продуктов.`,
            risk: ['Перегруз целей', loadPct, 'дохода уходит на плановые взносы'],
            lever: ['Главный рычаг', largestGroup, 'пересобрать сроки и приоритеты'],
            decisionRows: [
                ['Сократить перегруз', 'Вернуть план в пределы устойчивого cash flow.', `Первой пересчитать «${largestGoal}».`],
                ['Развести приоритеты', 'Обязательные цели не должны конкурировать с опциональными.', 'Пометить цели как must-have / optional.'],
                ['Проверить срок', 'Удлинение горизонта часто снижает ежемесячный платёж.', 'Сравнить 2-3 срока по ключевой цели.'],
            ],
            recommendedScenario: 'Сначала снизить ежемесячную нагрузку по самым тяжёлым целям, затем закрепить резерв и только после этого возвращать опциональные цели.',
        },
        protection_gap: {
            headline: 'Плану не хватает защитного контура',
            lead: 'Перед усилением инвестиций нужно закрыть риск ликвидности и семейных обязательств.',
            keyInsight: reserveGap
                ? 'В плане не выделен финансовый резерв. Это повышает риск продавать долгие активы при внезапных расходах.'
                : 'Резерв есть, но страховая защита требует проверки на фоне обязательств и семейной нагрузки.',
            risk: ['Защитный разрыв', reserveGap ? 'резерв' : 'LIFE', 'контур нужно проверить до ускорения целей'],
            lever: ['Главный рычаг', 'резерв', 'сначала ликвидность, потом длинный капитал'],
            decisionRows: [
                ['Закрыть защиту', 'Снизить риск кассового разрыва и резкой продажи активов.', reserveGap ? 'Добавить или усилить финансовый резерв.' : 'Проверить LIFE-покрытие.'],
                ['Не ускорять цели', 'Инвестиционный блок не должен заменять ликвидность.', 'Сначала подтвердить защитный контур.'],
                ['Назначить контроль', 'Защита зависит от дохода, семьи и обязательств.', 'Пересматривать защиту раз в год.'],
            ],
            recommendedScenario: 'Первые 90 дней — резерв и защита. После подтверждения устойчивости — плановое движение к долгосрочным целям.',
        },
        retirement_gap: {
            headline: 'Пенсионный блок — главный контур долгосрочного капитала',
            lead: 'План должен защищать текущий cash flow и одновременно удерживать пенсионную траекторию.',
            keyInsight: `Группа «${largestGroup}» формирует ключевую долгосрочную нагрузку. Её нельзя оценивать только по взносу — важны срок, доходность и регулярность.`,
            risk: ['Пенсионный разрыв', largestGroup, 'главная долгосрочная зона контроля'],
            lever: ['Главный рычаг', '20+ лет', 'дисциплина пополнений и пересчёт доходности'],
            decisionRows: [
                ['Сохранить траекторию', 'Пенсионная цель чувствительна к ранним пропускам взносов.', 'Закрепить регулярный платёж.'],
                ['Проверить доходность', 'Долгий срок усиливает эффект ставки и инфляции.', 'Сверить базовый и стресс-сценарии.'],
                ['Не ломать резерв', 'Пенсионный капитал не должен закрывать краткосрочные расходы.', 'Держать резерв отдельно.'],
            ],
            recommendedScenario: 'Сначала обеспечить резерв, затем стабильно вести пенсионный взнос и пересматривать сценарий доходности не реже раза в квартал.',
        },
        growth_ready: {
            headline: 'План устойчив: можно управлять ускорением целей',
            lead: 'Свободный поток и структура целей позволяют не только выполнять базовый план, но и обсуждать ускорение приоритетных направлений.',
            keyInsight: `После обязательств и ПФП остаётся ${formatMoney(freeCashflow)} — около ${freePct} дохода. Это даёт пространство для ускорения без потери контроля.`,
            risk: ['Риск дисциплины', freePct, 'дохода остаётся после обязательств и ПФП'],
            lever: ['Главный рычаг', 'ускорение', 'направлять избыток в приоритетные цели'],
            decisionRows: [
                ['Ускорить приоритеты', 'Свободный поток можно направить в цели с максимальным эффектом.', `Проверить ускорение для «${largestGoal}».`],
                ['Сохранить резерв', 'Рост не должен съедать ликвидность.', 'Оставить резерв отдельным контуром.'],
                ['Контролировать риск', 'Ускорение должно соответствовать риск-профилю.', 'Сверять портфель раз в квартал.'],
            ],
            recommendedScenario: 'Базовый сценарий можно усилить: часть свободного потока направлять в приоритетные цели после проверки резерва и риск-профиля.',
        },
    };

    const selected = catalog[scenario] || catalog.cashflow_working;
    return {
        scenario,
        headline: selected.headline,
        lead: selected.lead,
        keyInsight: selected.keyInsight,
        sustainabilityIndex: score,
        cards: [
            { kind: 'risk', title: selected.risk[0], metric: selected.risk[1], body: selected.risk[2] },
            { kind: 'lever', title: selected.lever[0], metric: selected.lever[1], body: selected.lever[2] },
            { kind: 'effect', title: 'Главный эффект', metric: projected || '—', body: 'целевой капитал по базовому сценарию' },
        ],
        decisionRows: selected.decisionRows.map(([decision, why, nextStep]) => ({ decision, why, nextStep })),
        recommendedScenario: selected.recommendedScenario,
        source: 'deterministic-template',
    };
}

/** НСЖ/ИСЖ и аналоги: доходность в отчёте не задаём и не включаем в средневзвешенную по портфелю. */
function isLifeInsuranceProduct(nameRaw, productTypeRaw) {
    const pt = String(productTypeRaw || '').toUpperCase().trim();
    if (pt && /NSJ|ИСЖ|НСЖ|INSURANCE|LIFE_INSURANCE/i.test(pt)) return true;
    const text = `${nameRaw || ''}`.toLowerCase();
    return /нсж|исж|страхован|страховка|подушка безопасности|(\s|^)жизн(и|ь)(\s|,|$)/i.test(text)
        || /\blife insurance\b/i.test(text);
}

function allocationFromPortfolio(items, totalValue, { monthly = false } = {}) {
    const list = Array.isArray(items) ? items : [];
    const rows = list
        .map((item) => {
            const nameForKind = item.name || item.assetClass || 'Инструмент';
            const percent = toFiniteNumber(item.share_percent ?? item.share ?? item.value, 0);
            const value = toFiniteNumber(item.amount, Number.isFinite(Number(totalValue)) ? (totalValue * percent) / 100 : 0);
            let yieldPercent = item.yield_percent ?? item.yield;
            if (isLifeInsuranceProduct(nameForKind, item.product_type)) yieldPercent = null;
            return {
                label: nameForKind,
                percent,
                value,
                yieldPercent,
                productType: item.product_type ?? null,
                role: portfolioAssetRole(nameForKind, item.product_type),
            };
        })
        .filter((item) => item.percent > 0 || item.value > 0);
    const totalPercent = rows.reduce((sum, item) => sum + item.percent, 0);
    const totalAmount = rows.reduce((sum, item) => sum + item.value, 0);
    let normalized = rows;
    if (rows.length && totalPercent <= 0 && totalAmount > 0) {
        normalized = rows.map((item) => ({ ...item, percent: Math.round((item.value / totalAmount) * 1000) / 10 }));
    } else if (rows.length && totalPercent > 0 && Math.abs(totalPercent - 100) > 0.01) {
        normalized = rows.map((item) => ({ ...item, percent: Math.round((item.percent / totalPercent) * 1000) / 10 }));
    }
    if (!rows.length && totalValue > 0) {
        return [{ label: monthly ? 'Ежемесячные пополнения' : 'Стартовый капитал', percent: 100, value: totalValue }];
    }
    return compactAllocationRows(normalized, 6);
}

function portfolioAssetRole(nameRaw, productTypeRaw) {
    const text = `${nameRaw || ''} ${productTypeRaw || ''}`.toLowerCase();
    if (/депозит|накоп|сч[её]т|deposit|saving/.test(text)) return 'ликвидность и короткий резерв';
    if (/облигац|bond/.test(text)) return 'стабильность и купонный поток';
    if (/акци|stock|equity|фонд/.test(text)) return 'рост капитала на длинном горизонте';
    if (/пдс|нпф|пенси/.test(text)) return 'пенсионный контур и льготы';
    if (/нсж|исж|life|страх/.test(text)) return 'страховая защита и снижение хвостовых рисков';
    return 'диверсификация портфеля';
}

function portfolioHorizonMonths(goals) {
    return (Array.isArray(goals) ? goals : []).reduce((max, goal) => {
        const months = toFiniteNumber(goal?.summary?.target_months ?? goal?.summary?.term_months ?? goal?.term_months, 0);
        return Math.max(max, months);
    }, 0);
}

function formatHorizon(months) {
    const n = Math.max(0, Math.round(toFiniteNumber(months, 0)));
    if (n <= 0) return '—';
    const years = Math.max(1, Math.round(n / 12));
    if (years >= 20) return '20+ лет';
    return `${years} ${years % 10 === 1 && years % 100 !== 11 ? 'год' : years % 10 >= 2 && years % 10 <= 4 && (years % 100 < 12 || years % 100 > 14) ? 'года' : 'лет'}`;
}

function totalProjectedCapitalFromGoals(goals) {
    return (Array.isArray(goals) ? goals : []).reduce((sum, goal) => {
        const summary = goal?.summary || {};
        const type = goalType(goal);
        const value =
            summary.projected_capital_at_end ??
            summary.projected_capital_at_retirement ??
            summary.total_capital_at_end ??
            summary.expected_cash_value ??
            (type === 'RENT' ? summary.initial_capital : null) ??
            0;
        return sum + toFiniteNumber(value, 0);
    }, 0);
}

function weightedYieldFromRows(rows, fallbackWeight = 0, weightMultiplier = 1) {
    return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        if (isLifeInsuranceProduct(row?.name, row?.product_type)) return acc;
        const yieldPercent = toFiniteNumber(row?.yield_percent ?? row?.yield, NaN);
        if (!Number.isFinite(yieldPercent)) return acc;
        const baseWeight = toFiniteNumber(row?.amount, 0) || (fallbackWeight > 0 ? (fallbackWeight * toFiniteNumber(row?.share_percent ?? row?.share, 0)) / 100 : 0);
        const weight = baseWeight * weightMultiplier;
        if (weight <= 0) return acc;
        acc.weight += weight;
        acc.weightedYield += weight * yieldPercent;
        return acc;
    }, { weight: 0, weightedYield: 0 });
}

function calculatePortfolioYield({ portfolio, initialTotal, monthlyTotal, goals }) {
    const initialYield = weightedYieldFromRows(portfolio.assets_allocation, initialTotal);
    const monthlyYield = weightedYieldFromRows(portfolio.cash_flow_allocation, monthlyTotal, 12);
    const combinedWeight = initialYield.weight + monthlyYield.weight;
    if (combinedWeight > 0) {
        return Math.round(((initialYield.weightedYield + monthlyYield.weightedYield) / combinedWeight) * 10) / 10;
    }

    const goalYield = (Array.isArray(goals) ? goals : []).reduce((acc, goal) => {
        if (goalType(goal) === 'LIFE' || goalTypeId(goal) === 5) return acc;
        const y = toFiniteNumber(goal?.summary?.accumulation_yield_percent ?? goal?.pdf_metrics?.portfolio_yield_percent, NaN);
        if (!Number.isFinite(y)) return acc;
        const weight = Math.max(toFiniteNumber(pickGoalCapital(goal), 0), toFiniteNumber(pickGoalInitial(goal), 0), 1);
        acc.weight += weight;
        acc.weightedYield += weight * y;
        return acc;
    }, { weight: 0, weightedYield: 0 });
    if (goalYield.weight > 0) return Math.round((goalYield.weightedYield / goalYield.weight) * 10) / 10;

    return portfolio.estimated_portfolio_yield_percent;
}

function compactAllocationRows(rows, maxRows = 6) {
    const list = Array.isArray(rows) ? rows.filter((row) => toFiniteNumber(row?.percent, 0) > 0 || toFiniteNumber(row?.value, 0) > 0) : [];
    if (list.length <= maxRows) return list;
    const head = list.slice(0, Math.max(1, maxRows - 1));
    const tail = list.slice(Math.max(1, maxRows - 1));
    const tailValue = tail.reduce((sum, item) => sum + toFiniteNumber(item.value, 0), 0);
    const tailPercent = tail.reduce((sum, item) => sum + toFiniteNumber(item.percent, 0), 0);
    const tailWeightedYield = tail.reduce((sum, item) => {
        const value = toFiniteNumber(item.value, 0);
        const y = toFiniteNumber(item.yieldPercent, NaN);
        return Number.isFinite(y) && value > 0 ? sum + value * y : sum;
    }, 0);
    return [
        ...head,
        {
            label: 'Прочее',
            percent: Math.round(tailPercent * 10) / 10,
            value: tailValue,
            yieldPercent: tailValue > 0 && tailWeightedYield > 0 ? tailWeightedYield / tailValue : null,
            role: 'прочие инструменты портфеля',
        },
    ];
}

function buildCombinedAllocation(initialAllocation, monthlyAllocation, monthlyTotal) {
    const byName = new Map();
    const add = (item, multiplier = 1) => {
        const label = item?.label || 'Инструмент';
        if (!byName.has(label)) {
            byName.set(label, {
                label,
                value: 0,
                weightedYield: 0,
                role: item?.role || portfolioAssetRole(label),
            });
        }
        const row = byName.get(label);
        const value = toFiniteNumber(item?.value, 0) * multiplier;
        row.value += value;
        const y = isLifeInsuranceProduct(label, item?.productType)
            ? NaN
            : toFiniteNumber(item?.yieldPercent, NaN);
        if (Number.isFinite(y) && value > 0) row.weightedYield += value * y;
    };
    (Array.isArray(initialAllocation) ? initialAllocation : []).forEach((item) => add(item));
    // Monthly money is annualized only for the combined role table; KPI still shows monthly contribution separately.
    (Array.isArray(monthlyAllocation) ? monthlyAllocation : []).forEach((item) => add(item, 12));

    const rows = [...byName.values()].filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (!rows.length || total <= 0) return [];
    return compactAllocationRows(rows.map((row) => ({
        ...row,
        percent: Math.round((row.value / total) * 1000) / 10,
        yieldPercent: row.value > 0 && row.weightedYield > 0 ? row.weightedYield / row.value : null,
    })), 6);
}

function buildLiquidityBuckets(goals, projectedTotal) {
    const rows = Array.isArray(goals) ? goals : [];
    const reserve = rows
        .filter((goal) => goalPageType(goal) === FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE)
        .reduce((sum, goal) => sum + toFiniteNumber(pickGoalCapital(goal) || pickGoalTarget(goal), 0), 0);
    const mid = rows
        .filter((goal) => {
            const months = goalMonths(goal);
            return months > 0 && months <= 36 && goalPageType(goal) !== FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE;
        })
        .reduce((sum, goal) => sum + toFiniteNumber(pickGoalCapital(goal) || pickGoalTarget(goal), 0), 0);
    const long = Math.max(0, toFiniteNumber(projectedTotal, 0) - reserve - mid);
    return [
        { name: 'Резерв', horizon: '0-6 месяцев', value: reserve },
        { name: 'Средний горизонт', horizon: '1-3 года', value: mid },
        { name: 'Долгий капитал', horizon: '3+ года', value: long },
    ];
}

function buildObjectiveMapping(goals) {
    const rows = (Array.isArray(goals) ? goals : []).slice(0, 4).map((goal) => {
        const title = goalDisplayName(goal);
        const term = pickGoalTerm(goal);
        const capital = pickGoalCapital(goal) || pickGoalTarget(goal);
        return {
            title,
            text: `${term}; расчётный капитал ${formatMoney(capital, { short: true })}.`,
        };
    });
    return rows.length ? rows : [{ title: 'Портфель', text: 'Цели будут связаны с продуктами после расчёта.' }];
}

function buildV2Model(report = {}, options = {}) {
    const rawPid = options.projectId != null ? Number(options.projectId) : null;
    const metaProjectId = Number.isFinite(rawPid) && rawPid > 0 ? rawPid : null;
    const goals = filterGoals(report.goals_detailed || [], options.goalTypes).sort((a, b) => goalSortWeight(a) - goalSortWeight(b));
    const clientName = report?.client_info?.full_name || report?.client_info?.first_name || 'Клиент';
    const portfolio = report?.overall_plan?.pdf_metrics?.portfolio || {};
    const consolidatedPortfolio = report?.overall_plan?.consolidated_portfolio || {};
    const portfolioSource = {
        ...portfolio,
        assets_allocation: Array.isArray(portfolio.assets_allocation) && portfolio.assets_allocation.length
            ? portfolio.assets_allocation
            : consolidatedPortfolio.assets_allocation,
        cash_flow_allocation: Array.isArray(portfolio.cash_flow_allocation) && portfolio.cash_flow_allocation.length
            ? portfolio.cash_flow_allocation
            : consolidatedPortfolio.cash_flow_allocation,
    };
    const familyContext = report?.family_page_ai_context || {};
    const initialTotal = toFiniteNumber(portfolio.total_initial_capital ?? consolidatedPortfolio.total_initial_capital, 0);
    const monthlyTotal = toFiniteNumber(portfolio.total_monthly_replenishment ?? consolidatedPortfolio.total_monthly_replenishment, 0);
    const goalsProjectedTotal = totalProjectedCapitalFromGoals(goals);
    const projectedTotal = toFiniteNumber(report?.overall_plan?.chart_waterfall?.total_projected, 0) ||
        toFiniteNumber(report?.summary?.total_capital, 0) ||
        goalsProjectedTotal;
    const horizonMonths = portfolioHorizonMonths(goals);
    const initialAllocation = allocationFromPortfolio(portfolioSource.assets_allocation, initialTotal);
    const monthlyAllocation = allocationFromPortfolio(portfolioSource.cash_flow_allocation, monthlyTotal, { monthly: true });
    const assetsTotal = toFiniteNumber(report?.current_situation?.assets_total, 0);
    const liabilitiesTotal = toFiniteNumber(report?.current_situation?.liabilities_total, 0);
    const netWorth = toFiniteNumber(report?.current_situation?.net_worth, assetsTotal - liabilitiesTotal);
    const cashflow = familyContext.cashflow_monthly_rub || {};
    const income = toFiniteNumber(cashflow.income ?? report?.client_info?.avg_monthly_income, 0);
    const obligations = toFiniteNumber(cashflow.obligations_total, 0);
    const plannedContributions = toFiniteNumber(cashflow.planned_pfp_contributions ?? monthlyTotal, monthlyTotal);
    const freeCashflow = Math.round(income - (obligations + plannedContributions));
    const currentState = {
        assetsTotal,
        liabilitiesTotal,
        netWorth,
        income,
        obligations,
        plannedContributions,
        freeCashflow,
        assetsBreakdown: report?.current_situation?.assets_breakdown || [],
        family: familyContext.family || {},
        familyClient: familyContext.client || {},
        cashflow,
    };
    const portfolioModel = {
        initialTotal,
        monthlyTotal,
        projectedTotal,
        expectedReturn: calculatePortfolioYield({
            portfolio: portfolioSource,
            initialTotal,
            monthlyTotal,
            goals,
        }),
        horizonMonths,
        horizonLabel: formatHorizon(horizonMonths),
        riskProfile: goals.map(riskProfileLabel).find((value) => value && value !== 'По анкете клиента') || 'По анкете клиента',
        initialAllocation,
        monthlyAllocation,
        allocation: buildCombinedAllocation(initialAllocation, monthlyAllocation, monthlyTotal),
        liquidityBuckets: buildLiquidityBuckets(goals, projectedTotal),
        objectiveMapping: buildObjectiveMapping(goals),
        principles: [
            { title: 'Сначала ликвидность', text: 'Резерв и короткие цели отделены от долгого капитала.' },
            { title: 'Доходность через дисциплину', text: 'Регулярные пополнения важнее попыток угадать точку входа.' },
            { title: 'Риск снижается к цели', text: 'Чем ближе срок, тем больше защитных инструментов.' },
            { title: 'Квартальный контроль', text: 'Портфель живёт через пересчёт и ребалансировку.' },
        ],
    };
    const cashflowDiagnostics = buildCashflowDiagnostics({
        income,
        obligations,
        plannedContributions,
        freeCashflow,
    });
    const goalsDiagnostics = buildGoalsDiagnostics(goals, { income, plannedContributions });
    const executiveDecision = buildExecutiveDecision({
        cashflowDiagnostics,
        goalsDiagnostics,
        currentState,
        portfolio: portfolioModel,
    });

    return {
        reportSchemaVersion: FINAM_REPORT_V2_SCHEMA_VERSION,
        meta: { projectId: metaProjectId },
        /** Полный `goals_detailed` для паритета с v1 `buildRepleneshmentRows` (подробный план, страхование жизни). */
        replenishmentReport: { goals_detailed: Array.isArray(report.goals_detailed) ? report.goals_detailed : [] },
        client: {
            name: clientName,
            firstName: report?.client_info?.first_name || clientName,
            age: report?.client_info?.age,
            income,
            planningHorizon: portfolioModel.horizonLabel,
            reportDate: formatDateRu(options.reportDate || new Date()),
        },
        advisor: options.advisor || {
            fullName: 'Финансовый консультант',
            email: '',
            phone: '',
        },
        currentState,
        goals,
        goalGroups: groupGoals(goals),
        goalsDiagnostics,
        cashflowDiagnostics,
        executiveDecision,
        overallPlan: report?.overall_plan || {},
        executiveSummary: {
            paragraphs: paragraphsFromText(report?.ai_executive_summary?.summary_text, 3),
            headline: projectedTotal > 0
                ? `План ведёт к капиталу ${formatMoney(projectedTotal, { short: true })}`
                : 'Финансовый план собран по актуальным целям клиента',
        },
        portfolio: portfolioModel,
        taxBenefits: report?.overall_plan?.tax_benefits || {},
        comonShowcase: report?.comon_showcase || null,
        macroData: options.macroData || report?.macroData || report?.macro_data || {},
        riskDeclaration: report?.riskDeclaration || report?.risk_declaration || {},
    };
}

function buildBaseCss() {
    const tokensCss = readLocalCss('tokens.css');
    const coverBg = localAssetDataUrl('assets/cover-bg.png');
    const aiAvatar = localAssetDataUrl('assets/avatar-ai-finam-v2.png');
    return `
${tokensCss}
@page { size: 595px 842px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: var(--finam-v2-font-stack), Arial, sans-serif; color: var(--finam-v2-color-text); }
.finam-v2-page {
  width: 595px;
  height: 842px;
  overflow: hidden;
  background: var(--finam-v2-color-surface);
  padding: 34px 38px 28px;
  position: relative;
  display: flex;
  flex-direction: column;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.finam-v2-page--cover::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 48%;
  background-image: linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,.52), rgba(255,255,255,0)), url('${coverBg || ''}');
  background-size: 100% 100%, cover;
  background-position: center bottom, 70% 85%;
  z-index: 0;
}
.finam-v2-page > * { position: relative; z-index: 1; }
.finam-v2-prod__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 9px; color: var(--finam-v2-color-text-muted); text-transform: uppercase; letter-spacing: .08em; }
.finam-v2-prod__dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--finam-v2-color-accent-blue); margin-right: 7px; vertical-align: -1px; }
.finam-v2-prod__rule { border: 0; border-top: 1px solid var(--finam-v2-color-border); margin: 14px 0 18px; }
.finam-v2-prod__kicker { font-size: 9px; font-weight: 700; color: var(--finam-v2-color-accent-blue); text-transform: uppercase; letter-spacing: .09em; margin-bottom: 8px; }
.finam-v2-prod__title { font-family: var(--finam-v2-font-display), Georgia, serif; font-size: 30px; line-height: 1.05; color: var(--finam-v2-color-navy-deep); margin: 0 0 12px; letter-spacing: -0.03em; }
.finam-v2-prod__title--sm { font-size: 24px; }
.finam-v2-prod__lead { font-size: 12px; line-height: 1.45; color: var(--finam-v2-color-text-soft); margin: 0 0 16px; max-width: 480px; }
.finam-v2-prod__grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.finam-v2-prod__grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.finam-v2-prod__card { border: 1px solid var(--finam-v2-color-border); border-radius: 12px; background: #fff; padding: 12px; }
.finam-v2-prod__card--soft { background: var(--finam-v2-color-soft-gray); }
.finam-v2-prod__card--green { background: #ecfdf5; border-color: #d1fae5; }
.finam-v2-prod__label { font-size: 8px; line-height: 1.2; color: var(--finam-v2-color-text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
.finam-v2-prod__value { font-size: 17px; line-height: 1.1; font-weight: 800; color: var(--finam-v2-color-navy-deep); }
.finam-v2-prod__value--blue { color: var(--finam-v2-color-accent-blue); }
.finam-v2-prod__text { font-size: 10px; line-height: 1.38; color: var(--finam-v2-color-text-soft); margin: 0; }
.finam-v2-prod__small { font-size: 8.5px; line-height: 1.35; color: var(--finam-v2-color-text-muted); }
.finam-v2-prod__table { width: 100%; border-collapse: collapse; font-size: 8.6px; line-height: 1.25; }
.finam-v2-prod__table th { text-align: left; color: var(--finam-v2-color-text-muted); font-weight: 700; padding: 6px 6px; border-bottom: 1px solid var(--finam-v2-color-border); }
.finam-v2-prod__table td { padding: 6px; border-bottom: 1px solid #edf2f7; vertical-align: top; }
.finam-v2-prod__table td:last-child, .finam-v2-prod__table th:last-child { text-align: right; }
.finam-v2-prod__list { margin: 0; padding-left: 15px; font-size: 9.5px; line-height: 1.4; color: var(--finam-v2-color-text-soft); }
.finam-v2-prod__list li { margin: 0 0 5px; }
.finam-v2-prod__footer { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--finam-v2-color-border); display: flex; justify-content: space-between; gap: 20px; font-size: 7.8px; line-height: 1.35; color: var(--finam-v2-color-text-muted); }
.finam-v2-prod__stack { width: 100%; height: 13px; display: flex; overflow: hidden; border-radius: 999px; background: #e2e8f0; }
.finam-v2-prod__stack span { display: block; min-width: 2px; height: 100%; }
.finam-v2-prod__allocation-row { display: grid; grid-template-columns: 1fr 42px 74px; gap: 8px; align-items: center; font-size: 9px; padding: 6px 0; border-bottom: 1px solid #edf2f7; }
.finam-v2-prod__bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-top: 4px; }
.finam-v2-prod__bar-fill { height: 100%; background: linear-gradient(90deg, var(--finam-v2-color-navy-deep), var(--finam-v2-color-accent-blue)); }
.finam-v2-prod__goal-hero { display: grid; grid-template-columns: 1.25fr 130px; gap: 14px; align-items: stretch; }
.finam-v2-prod__goal-img { width: 130px; height: 130px; border-radius: 18px; object-fit: cover; border: 1px solid var(--finam-v2-color-border); background: #e2e8f0; }
.finam-v2-prod__ai { display: grid; grid-template-columns: 36px 1fr; gap: 10px; align-items: start; border-radius: 14px; background: #eff6ff; border: 1px solid #dbeafe; padding: 10px; }
.finam-v2-prod__ai::before { content: ''; width: 36px; height: 36px; border-radius: 50%; background: #fff url('${aiAvatar || ''}') center / cover no-repeat; border: 1px solid #bfdbfe; }
.finam-v2-prod__timeline { display: grid; gap: 9px; }
.finam-v2-prod__step { display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start; }
.finam-v2-prod__step-num { width: 26px; height: 26px; border-radius: 50%; background: var(--finam-v2-color-navy-deep); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 11px; }
`;
}

function wrapPage({ title, label, body, cover = false }) {
    const css = buildBaseCss();
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title || 'Финансовый план')}</title>
  <style>${css}</style>
</head>
<body>
  <article class="finam-v2-page${cover ? ' finam-v2-page--cover' : ''}">
${body}
    <footer class="finam-v2-prod__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span>${escapeHtml(label || title || '')}</span>
    </footer>
  </article>
</body>
</html>`;
}

function pageHeader(label) {
    return `
    <header class="finam-v2-prod__header">
      <div><span class="finam-v2-prod__dot"></span>Финансовый план</div>
      <div>${escapeHtml(label)}</div>
    </header>
    <hr class="finam-v2-prod__rule" />`;
}

function renderMetricCard(label, value, extra = '') {
    return `<section class="finam-v2-prod__card">
      <div class="finam-v2-prod__label">${escapeHtml(label)}</div>
      <div class="finam-v2-prod__value">${escapeHtml(value)}</div>
      ${extra ? `<p class="finam-v2-prod__small">${escapeHtml(extra)}</p>` : ''}
    </section>`;
}

function renderCover(model) {
    const body = `
    <div style="padding-top: 44px;">
      <p class="finam-v2-prod__kicker">Finam · Personal Financial Plan</p>
      <h1 class="finam-v2-prod__title" style="font-size: 40px; max-width: 450px;">Персональный финансовый план</h1>
      <p class="finam-v2-prod__lead">Версия v2 собрана по актуальным данным клиента, целям и расчётам PFP.</p>
      <div class="finam-v2-prod__grid-2" style="max-width: 430px; margin-top: 28px;">
        ${renderMetricCard('Клиент', model.client.name)}
        ${renderMetricCard('Дата отчёта', model.client.reportDate)}
        ${renderMetricCard('Целей в плане', String(model.goals.length))}
        ${renderMetricCard('Плановый капитал', formatMoney(model.portfolio.projectedTotal, { short: true }))}
      </div>
    </div>`;
    return wrapPage({ title: 'Обложка', label: 'Обложка', body, cover: true });
}

function renderIntro(model) {
    const body = `${pageHeader('Введение')}
    <p class="finam-v2-prod__kicker">Как читать отчёт</p>
    <h1 class="finam-v2-prod__title">От расчёта к программе действий</h1>
    <p class="finam-v2-prod__lead">Отчёт показывает текущее состояние, портфель целей, сценарии и конкретные шаги. AI формулирует выводы, а цифры берутся из расчётов и клиентских данных.</p>
    <div class="finam-v2-prod__grid-3">
      ${renderMetricCard('Диагностика', '1', 'Активы, обязательства, свободный поток и устойчивость плана.')}
      ${renderMetricCard('Цели', String(model.goals.length), 'Каждая цель проверяется по сроку, взносу и требуемому капиталу.')}
      ${renderMetricCard('Действия', '90 дней', 'Первые шаги после консультации и контрольный ритм.')}
    </div>
    <section class="finam-v2-prod__ai" style="margin-top: 18px;">
      <p class="finam-v2-prod__text"><strong>Главная логика:</strong> сначала защищаем устойчивость семьи и ликвидность, затем распределяем долгий капитал по целям и продуктам.</p>
    </section>`;
    return wrapPage({ title: 'Введение', label: 'Введение', body });
}

function renderCurrentState(model) {
    const s = model.currentState;
    const income = Math.max(s.income, 1);
    const obligationPct = Math.min(Math.max((s.obligations / income) * 100, 0), 100);
    const pfpPct = Math.min(Math.max((s.plannedContributions / income) * 100, 0), 100);
    const freePct = Math.min(Math.max((s.freeCashflow / income) * 100, 0), 100);
    const assetsRows = (s.assetsBreakdown || []).slice(0, 6).map((asset) => {
        const pct = s.assetsTotal > 0 ? Math.min((toFiniteNumber(asset.value) / s.assetsTotal) * 100, 100) : 0;
        return `<div class="finam-v2-prod__allocation-row">
          <div><strong>${escapeHtml(asset.name || 'Актив')}</strong><div class="finam-v2-prod__bar"><div class="finam-v2-prod__bar-fill" style="width:${pct}%;"></div></div></div>
          <span>${formatPercent(pct)}</span>
          <strong>${formatMoney(asset.value, { short: true })}</strong>
        </div>`;
    }).join('');

    const body = `${pageHeader('Текущее состояние')}
    <p class="finam-v2-prod__kicker">Финансовая позиция</p>
    <h1 class="finam-v2-prod__title">Чистый капитал: ${escapeHtml(formatMoney(s.netWorth, { short: true }))}</h1>
    <div class="finam-v2-prod__grid-3">
      ${renderMetricCard('Активы', formatMoney(s.assetsTotal, { short: true }))}
      ${renderMetricCard('Обязательства', formatMoney(s.liabilitiesTotal, { short: true }))}
      ${renderMetricCard('Свободный поток', formatMoney(s.freeCashflow, { perMonth: true, short: true }))}
    </div>
    <div class="finam-v2-prod__grid-2" style="margin-top: 14px;">
      <section class="finam-v2-prod__card">
        <div class="finam-v2-prod__label">Структура активов</div>
        ${assetsRows || '<p class="finam-v2-prod__text">Активы не детализированы в карточке клиента.</p>'}
      </section>
      <section class="finam-v2-prod__card finam-v2-prod__card--soft">
        <div class="finam-v2-prod__label">Ежемесячный денежный поток</div>
        <div class="finam-v2-prod__allocation-row"><div>Доход</div><span>100%</span><strong>${formatMoney(s.income, { perMonth: true, short: true })}</strong></div>
        <div class="finam-v2-prod__allocation-row"><div>Обязательства</div><span>${formatPercent(obligationPct)}</span><strong>${formatMoney(s.obligations, { perMonth: true, short: true })}</strong></div>
        <div class="finam-v2-prod__allocation-row"><div>Взносы в план</div><span>${formatPercent(pfpPct)}</span><strong>${formatMoney(s.plannedContributions, { perMonth: true, short: true })}</strong></div>
        <div class="finam-v2-prod__allocation-row"><div><strong>Свободно</strong></div><span>${formatPercent(freePct)}</span><strong>${formatMoney(s.freeCashflow, { perMonth: true, short: true })}</strong></div>
      </section>
    </div>`;
    return wrapPage({ title: 'Текущее состояние', label: 'Текущее состояние', body });
}

function renderGoals(model) {
    const totalMonthly = model.goals.reduce((sum, goal) => sum + toFiniteNumber(pickGoalMonthly(goal), 0), 0);
    const groupCards = model.goalGroups.map((group) => {
        const groupMonthly = group.goals.reduce((sum, goal) => sum + toFiniteNumber(pickGoalMonthly(goal), 0), 0);
        const lines = group.goals.slice(0, 4).map((goal) => `<div class="finam-v2-prod__allocation-row"><div>${escapeHtml(goalDisplayName(goal))}</div><span>${pickGoalTerm(goal)}</span><strong>${formatMoney(pickGoalMonthly(goal), { perMonth: true, short: true })}</strong></div>`).join('');
        return `<section class="finam-v2-prod__card">
          <div class="finam-v2-prod__label">${escapeHtml(group.title)}</div>
          <div class="finam-v2-prod__value">${formatMoney(groupMonthly, { perMonth: true, short: true })}</div>
          ${lines || '<p class="finam-v2-prod__text">Нет целей в группе.</p>'}
        </section>`;
    }).join('');
    const segments = model.goalGroups.map((group, idx) => {
        const groupMonthly = group.goals.reduce((sum, goal) => sum + toFiniteNumber(pickGoalMonthly(goal), 0), 0);
        const pct = totalMonthly > 0 ? Math.max((groupMonthly / totalMonthly) * 100, 0) : 0;
        const colors = ['#002a4a', '#1e6bb8', '#93c5fd'];
        return `<span style="width:${pct}%; background:${colors[idx]};"></span>`;
    }).join('');
    const rows = model.goals.slice(0, 8).map((goal) => `<tr>
      <td><strong>${escapeHtml(goalDisplayName(goal))}</strong></td>
      <td>${escapeHtml(PAGE_TITLES[goalPageType(goal)] || goalType(goal))}</td>
      <td>${escapeHtml(pickGoalTerm(goal))}</td>
      <td>${escapeHtml(formatMoney(pickGoalMonthly(goal), { perMonth: true, short: true }))}</td>
      <td>${escapeHtml(formatMoney(pickGoalTarget(goal), { short: true }))}</td>
    </tr>`).join('');
    const body = `${pageHeader('Портфель целей')}
    <p class="finam-v2-prod__kicker">Диагностика целей</p>
    <h1 class="finam-v2-prod__title">В плане ${model.goals.length} ${model.goals.length === 1 ? 'цель' : 'целей'}</h1>
    <p class="finam-v2-prod__lead">Ежемесячный ресурс по целям: ${escapeHtml(formatMoney(totalMonthly, { perMonth: true, short: true }))}. Ниже — распределение нагрузки и приоритетные блоки.</p>
    <div class="finam-v2-prod__grid-3">${groupCards}</div>
    <section class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top: 12px;">
      <div class="finam-v2-prod__label">Распределение ежемесячного ресурса</div>
      <div class="finam-v2-prod__stack">${segments}</div>
    </section>
    <table class="finam-v2-prod__table" style="margin-top: 12px;">
      <thead><tr><th>Цель</th><th>Блок</th><th>Срок</th><th>Взнос</th><th>Капитал</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Цели не найдены</td></tr>'}</tbody>
    </table>`;
    return wrapPage({ title: 'Портфель целей', label: 'Портфель целей', body });
}

function renderExecutiveSummary(model) {
    const paragraphs = model.executiveSummary.paragraphs.length
        ? model.executiveSummary.paragraphs
        : ['План сформирован по актуальным клиентским данным. Основной фокус — дисциплина пополнений, ликвидность и регулярный пересчёт целей.'];
    const body = `${pageHeader('Управленческий вывод')}
    <p class="finam-v2-prod__kicker">Ключевой вывод плана</p>
    <h1 class="finam-v2-prod__title">${escapeHtml(model.executiveSummary.headline)}</h1>
    <section class="finam-v2-prod__ai">
      <div>${paragraphs.map((p) => `<p class="finam-v2-prod__text" style="margin-bottom: 8px;">${escapeHtml(p)}</p>`).join('')}</div>
    </section>
    <div class="finam-v2-prod__grid-3" style="margin-top: 14px;">
      ${renderMetricCard('Чистый капитал', formatMoney(model.currentState.netWorth, { short: true }))}
      ${renderMetricCard('Целевой капитал', formatMoney(model.portfolio.projectedTotal, { short: true }))}
      ${renderMetricCard('Регулярный взнос', formatMoney(model.portfolio.monthlyTotal, { perMonth: true, short: true }))}
    </div>
    <section class="finam-v2-prod__card finam-v2-prod__card--green" style="margin-top: 14px;">
      <div class="finam-v2-prod__label">Следующий шаг</div>
      <p class="finam-v2-prod__text">Зафиксировать первые действия на 90 дней: резерв, порядок пополнений и дату следующего пересчёта плана.</p>
    </section>`;
    return wrapPage({ title: 'Управленческий вывод', label: 'Управленческий вывод', body });
}

function renderGoalPage(model, goal) {
    const pageType = goalPageType(goal);
    const type = goalType(goal);
    const assetFile = ASSET_BY_GOAL_TYPE[type] || ASSET_BY_GOAL_TYPE.OTHER;
    const img = localAssetDataUrl(`assets/${assetFile}`);
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    const metrics = [
        renderMetricCard('Цель', formatMoney(pickGoalTarget(goal), { short: true })),
        renderMetricCard('Первоначально', formatMoney(pickGoalInitial(goal), { short: true })),
        renderMetricCard('Пополнение', formatMoney(pickGoalMonthly(goal), { perMonth: true, short: true })),
        renderMetricCard('Горизонт', pickGoalTerm(goal)),
    ].join('');
    const yieldValue = summary.accumulation_yield_percent ?? goal?.pdf_metrics?.portfolio_yield_percent;
    const tax = toFiniteNumber(summary.total_tax_benefit ?? details?.totals?.total_deductions, 0);
    const cofin = toFiniteNumber(summary.total_cofinancing ?? details?.totals?.total_cofinancing, 0);
    const rows = [
        ['Риск-профиль', riskProfileLabel(goal)],
        ['Ожидаемая доходность', formatPercent(yieldValue)],
        ['Налоговый эффект', tax > 0 ? formatMoney(tax, { short: true }) : 'не применён'],
        ['Софинансирование', cofin > 0 ? formatMoney(cofin, { short: true }) : 'не применено'],
    ].map(([k, v]) => `<div class="finam-v2-prod__allocation-row"><div>${escapeHtml(k)}</div><span></span><strong>${escapeHtml(v)}</strong></div>`).join('');
    const body = `${pageHeader(PAGE_TITLES[pageType])}
    <div class="finam-v2-prod__goal-hero">
      <div>
        <p class="finam-v2-prod__kicker">${escapeHtml(PAGE_TITLES[pageType])}</p>
        <h1 class="finam-v2-prod__title finam-v2-prod__title--sm">${escapeHtml(goalDisplayName(goal))}</h1>
        <p class="finam-v2-prod__lead">Страница собрана по фактическим параметрам цели: срок, стартовый капитал, регулярный взнос и расчётный результат.</p>
      </div>
      ${img ? `<img class="finam-v2-prod__goal-img" src="${escapeAttr(img)}" alt="" />` : ''}
    </div>
    <div class="finam-v2-prod__grid-2" style="margin-top: 12px;">${metrics}</div>
    <section class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top: 12px;">
      <div class="finam-v2-prod__label">Контур решения</div>
      ${rows}
    </section>
    <section class="finam-v2-prod__ai" style="margin-top: 12px;">
      <p class="finam-v2-prod__text">Для этой цели важно сверять взнос и риск-профиль при каждом изменении дохода, срока или стоимости цели. Если фактический свободный поток снижается, цель нужно пересчитать первой.</p>
    </section>`;
    return wrapPage({ title: PAGE_TITLES[pageType], label: PAGE_TITLES[pageType], body });
}

function renderPortfolioSummary(model) {
    const renderAlloc = (items, monthly = false) => items.map((item, index) => {
        const colors = ['#002a4a', '#1e6bb8', '#4f8fd9', '#93c5fd', '#64748b', '#0f766e'];
        return `<div class="finam-v2-prod__allocation-row">
          <div><strong>${escapeHtml(item.label)}</strong><div class="finam-v2-prod__bar"><div class="finam-v2-prod__bar-fill" style="width:${item.percent}%; background:${colors[index % colors.length]};"></div></div></div>
          <span>${formatPercent(item.percent)}</span>
          <strong>${formatMoney(item.value, { short: true, perMonth: monthly })}</strong>
        </div>`;
    }).join('');
    const body = `${pageHeader('Итоговый портфель')}
    <p class="finam-v2-prod__kicker">Сводная структура</p>
    <h1 class="finam-v2-prod__title">Портфель связывает цели, ликвидность и риск</h1>
    <div class="finam-v2-prod__grid-3">
      ${renderMetricCard('Стартовый капитал', formatMoney(model.portfolio.initialTotal, { short: true }))}
      ${renderMetricCard('Пополнение', formatMoney(model.portfolio.monthlyTotal, { perMonth: true, short: true }))}
      ${renderMetricCard('Доходность', formatPercent(model.portfolio.expectedReturn))}
    </div>
    <div class="finam-v2-prod__grid-2" style="margin-top: 14px;">
      <section class="finam-v2-prod__card">
        <div class="finam-v2-prod__label">Первоначальный капитал</div>
        ${renderAlloc(model.portfolio.initialAllocation)}
      </section>
      <section class="finam-v2-prod__card">
        <div class="finam-v2-prod__label">Ежемесячные пополнения</div>
        ${renderAlloc(model.portfolio.monthlyAllocation, true)}
      </section>
    </div>
    <section class="finam-v2-prod__card finam-v2-prod__card--green" style="margin-top: 12px;">
      <p class="finam-v2-prod__text"><strong>Принцип управления:</strong> короткая ликвидность не должна конкурировать с долгими целями, а инвестиционная часть проверяется через риск-профиль и горизонт.</p>
    </section>`;
    return wrapPage({ title: 'Итоговый портфель', label: 'Итоговый портфель', body });
}

function renderTaxPlanning(model) {
    const tax = model.taxBenefits || {};
    const rows = Object.entries(tax)
        .filter(([, value]) => typeof value === 'number' || (value && typeof value === 'object'))
        .slice(0, 8)
        .map(([key, value]) => {
            const amount = typeof value === 'number'
                ? value
                : toFiniteNumber(value.total ?? value.amount ?? value.value, 0);
            return `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(formatMoney(amount, { short: true }))}</td></tr>`;
        })
        .join('');
    const total = toFiniteNumber(model.overallPlan?.chart_waterfall?.state_support_nominal, 0);
    const body = `${pageHeader('Налоговое планирование')}
    <p class="finam-v2-prod__kicker">Льготы и софинансирование</p>
    <h1 class="finam-v2-prod__title">Государственная поддержка: ${escapeHtml(formatMoney(total, { short: true }))}</h1>
    <p class="finam-v2-prod__lead">Вычеты и софинансирование учитываются только если они есть в расчёте. Детализация ниже не заменяет налоговую консультацию.</p>
    <table class="finam-v2-prod__table">
      <thead><tr><th>Блок</th><th>Сумма</th></tr></thead>
      <tbody>${rows || `<tr><td>Налоговый эффект</td><td>${escapeHtml(total > 0 ? formatMoney(total, { short: true }) : 'не рассчитан')}</td></tr>`}</tbody>
    </table>
    <section class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top: 16px;">
      <p class="finam-v2-prod__text">Фактическое получение вычетов зависит от налоговой базы, лимитов и корректного оформления продуктов.</p>
    </section>`;
    return wrapPage({ title: 'Налоговое планирование', label: 'Налоговое планирование', body });
}

function renderComon(model) {
    const strategies = model.comonShowcase?.strategies || model.comonShowcase?.items || [];
    const rows = (Array.isArray(strategies) ? strategies : []).slice(0, 6).map((s) => `<tr>
      <td><strong>${escapeHtml(s.title || s.name || 'Стратегия')}</strong></td>
      <td>${escapeHtml(s.description || s.risk || 'Автоследование')}</td>
      <td>${escapeHtml(s.min_amount ? formatMoney(s.min_amount, { short: true }) : '—')}</td>
    </tr>`).join('');
    const body = `${pageHeader('Comon')}
    <p class="finam-v2-prod__kicker">Автоследование</p>
    <h1 class="finam-v2-prod__title">Comon как часть инвестиционного контура</h1>
    <p class="finam-v2-prod__lead">Стратегии используются только после проверки риск-профиля, горизонта и доли в общем портфеле.</p>
    <table class="finam-v2-prod__table">
      <thead><tr><th>Стратегия</th><th>Роль</th><th>Мин. вход</th></tr></thead>
      <tbody>${rows || '<tr><td>Каталог стратегий</td><td>Подбирается консультантом после сверки профиля клиента</td><td>—</td></tr>'}</tbody>
    </table>`;
    return wrapPage({ title: 'Comon', label: 'Comon', body });
}

function renderGenericProductPage(pageType) {
    const copy = {
        [FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES]: ['Стратегии доверительного управления', 'ДУ в отчёте подчёркивает облигационный контур (купон, ставка, ОФЗ): управляемый слой рядом с прямым владением бумагами, если продукт подходит доле в портфеле и горизонту.'],
        [FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS]: ['Предложения Финам', 'Специальные предложения показываются как сервисный блок и не меняют расчёт цели без отдельного решения клиента.'],
        [FINAM_REPORT_V2_PAGE_TYPES.INFLATION]: ['Макроконтур', 'Инфляция, ключевая ставка и доходности облигаций используются как контекст для регулярного пересчёта целей.'],
        [FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE]: ['Партнёрская ценность', 'Отчёт помогает консультанту вести регулярное сопровождение, а не ограничиваться одной выдачей PDF.'],
    };
    const [title, lead] = copy[pageType] || [PAGE_TITLES[pageType], 'Блок отчёта собран без моковых клиентских цифр.'];
    const body = `${pageHeader(title)}
    <p class="finam-v2-prod__kicker">${escapeHtml(title)}</p>
    <h1 class="finam-v2-prod__title">${escapeHtml(title)}</h1>
    <p class="finam-v2-prod__lead">${escapeHtml(lead)}</p>
    <div class="finam-v2-prod__grid-3">
      ${renderMetricCard('Проверка', 'профиль', 'Соответствие риск-профилю клиента.')}
      ${renderMetricCard('Контроль', 'квартал', 'Регулярная сверка параметров.')}
      ${renderMetricCard('Решение', 'клиент', 'Финальное решение принимает клиент.')}
    </div>`;
    return wrapPage({ title, label: title, body });
}

function renderRoadmap(model) {
    const steps = [
        ['90 дней', ['Уточнить резерв и обязательства', 'Зафиксировать регулярные пополнения', 'Проверить страховую защиту']],
        ['12 месяцев', ['Сверить факт пополнений', 'Пересчитать цели с инфляцией', 'Проверить налоговые вычеты']],
        ['3 года', ['Пересобрать портфель по риск-профилю', 'Оценить новые цели', 'Обновить сценарии']],
    ];
    const body = `${pageHeader('Дорожная карта')}
    <p class="finam-v2-prod__kicker">Что делаем дальше</p>
    <h1 class="finam-v2-prod__title">План превращается в календарь действий</h1>
    <div class="finam-v2-prod__timeline">
      ${steps.map(([horizon, actions], index) => `<section class="finam-v2-prod__step">
        <span class="finam-v2-prod__step-num">${index + 1}</span>
        <div class="finam-v2-prod__card">
          <div class="finam-v2-prod__label">${escapeHtml(horizon)}</div>
          <ul class="finam-v2-prod__list">${actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
        </div>
      </section>`).join('')}
    </div>`;
    return wrapPage({ title: 'Дорожная карта', label: 'Дорожная карта', body });
}

function renderDetailedPlan(model) {
    const rows = model.goals.map((goal) => `<tr>
      <td><strong>${escapeHtml(goalDisplayName(goal))}</strong></td>
      <td>${escapeHtml(formatMoney(pickGoalInitial(goal), { short: true }))}</td>
      <td>${escapeHtml(formatMoney(pickGoalMonthly(goal), { perMonth: true, short: true }))}</td>
      <td>${escapeHtml(pickGoalTerm(goal))}</td>
      <td>${escapeHtml(formatMoney(pickGoalTarget(goal), { short: true }))}</td>
    </tr>`).join('');
    const body = `${pageHeader('Подробный план')}
    <p class="finam-v2-prod__kicker">План пополнений</p>
    <h1 class="finam-v2-prod__title">Каждая цель получает свой денежный поток</h1>
    <table class="finam-v2-prod__table">
      <thead><tr><th>Цель</th><th>Старт</th><th>Взнос</th><th>Срок</th><th>Результат</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Цели не найдены</td></tr>'}</tbody>
    </table>`;
    return wrapPage({ title: 'Подробный план', label: 'Подробный план', body });
}

function renderRiskDeclaration(model) {
    const products = [
        ...model.portfolio.initialAllocation.map((a) => ({ ...a, source: 'стартовый капитал' })),
        ...model.portfolio.monthlyAllocation.map((a) => ({ ...a, source: 'ежемесячное пополнение' })),
    ].slice(0, 8);
    const rows = products.map((p) => `<tr>
      <td><strong>${escapeHtml(p.label)}</strong></td>
      <td>${escapeHtml(p.source)}</td>
      <td>${escapeHtml(formatPercent(p.percent))}</td>
      <td>рыночный и ликвидный риск контролируются долей и горизонтом</td>
    </tr>`).join('');
    const body = `${pageHeader('Декларация о рисках')}
    <p class="finam-v2-prod__kicker">Риск-контур</p>
    <h1 class="finam-v2-prod__title">Риск контролируется правилами, а не обещаниями доходности</h1>
    <p class="finam-v2-prod__lead">Декларация связывает продуктовые блоки с долей в портфеле, горизонтом и контрольными действиями.</p>
    <table class="finam-v2-prod__table">
      <thead><tr><th>Блок</th><th>Источник</th><th>Доля</th><th>Контроль</th></tr></thead>
      <tbody>${rows || '<tr><td>Портфель</td><td>план</td><td>—</td><td>контроль после выбора продуктов</td></tr>'}</tbody>
    </table>
    <section class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top: 14px;">
      <p class="finam-v2-prod__text">Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией. Финальное решение клиент принимает после проверки документов продукта.</p>
    </section>`;
    return wrapPage({ title: 'Декларация о рисках', label: 'Декларация о рисках', body });
}

function buildPages(model, options = {}) {
    const pages = [];
    const add = (type, html) => pages.push({ type, title: PAGE_TITLES[type] || type, html });

    if (options.includeCover !== false) add(FINAM_REPORT_V2_PAGE_TYPES.COVER, renderCover(model));
    if (options.includeSummary !== false) {
        add(FINAM_REPORT_V2_PAGE_TYPES.INTRO, renderIntro(model));
        add(FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE, renderCurrentState(model));
        add(FINAM_REPORT_V2_PAGE_TYPES.GOALS, renderGoals(model));
        add(FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY, renderExecutiveSummary(model));
    }

    for (const goal of model.goals) {
        add(goalPageType(goal), renderGoalPage(model, goal));
    }

    add(FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY, renderPortfolioSummary(model));
    add(FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING, renderTaxPlanning(model));
    add(FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW, renderComon(model));
    add(FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES, renderGenericProductPage(FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES));
    add(FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS, renderGenericProductPage(FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS));
    add(FINAM_REPORT_V2_PAGE_TYPES.INFLATION, renderGenericProductPage(FINAM_REPORT_V2_PAGE_TYPES.INFLATION));
    add(FINAM_REPORT_V2_PAGE_TYPES.ROADMAP, renderRoadmap(model));
    add(FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN, renderDetailedPlan(model));
    add(FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION, renderRiskDeclaration(model));
    if (options.includePartnerValue) {
        add(FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE, renderGenericProductPage(FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE));
    }

    return pages;
}

function buildToc(pages) {
    return pages.map((page, index) => ({
        id: `finam_v2_${page.type}_${index + 1}`,
        title: page.title,
        order: index + 1,
        page_start: index + 1,
        page_count: 1,
        report_schema_version: FINAM_REPORT_V2_SCHEMA_VERSION,
    }));
}

function buildTemplateHelpers() {
    return {
        formatMoney,
        formatPercent,
        goalDisplayName,
        goalPageType,
    };
}

async function buildFinamReportV2HtmlPackage({
    report,
    includeCover = true,
    includeSummary = true,
    goalTypes = null,
    includePartnerValue = false,
    advisor = null,
    macroData = null,
    projectId = null,
} = {}) {
    const model = buildV2Model(report, { goalTypes, advisor, macroData, projectId });
    return buildFinamV2TemplatePackage({
        model,
        includeCover,
        includeSummary,
        includePartnerValue,
        helpers: buildTemplateHelpers(),
    });
}

async function buildFinamReportV2PageHtml({
    report,
    pageType,
    goalId = null,
    goalTypes = null,
    macroData = null,
    projectId = null,
} = {}) {
    const model = buildV2Model(report, { goalTypes, macroData, projectId });
    const normalized = String(pageType || '').trim();
    const lower = normalized.toLowerCase();
    const upper = normalized.toUpperCase();

    const helpers = buildTemplateHelpers();
    const renderTemplatePage = (type, goal = null) =>
        buildFinamV2TemplatePageHtml({
            model,
            pageType: type,
            goal,
            helpers,
        });

    if (upper === 'SUMMARY') return renderTemplatePage(FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY);
    if (
        upper === 'PORTFOLIO_FINAL' ||
        ['portfolio', 'portfolio-overview', 'portfoliosummary', 'portfolio-summary'].includes(lower) ||
        normalized === FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY
    ) {
        return renderTemplatePage(FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY);
    }
    if (
        upper === 'TAX_PLANNING' ||
        ['tax', 'tax-planning', 'taxplanning'].includes(lower) ||
        normalized === FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING
    ) return renderTemplatePage(FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING);
    if (
        upper === 'REPLENESHMENT' ||
        upper === 'REPLENISHMENT' ||
        ['detailed-plan', 'detailedplan', 'repleneshment', 'replenishment'].includes(lower) ||
        normalized === FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN
    ) {
        return renderTemplatePage(FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN);
    }

    const goalPageTypes = new Set(Object.values(GOAL_TYPE_TO_PAGE_TYPE));
    const aliasGoalPageTypes = {
        'fin-reserve': FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
        finreserve: FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
        'goal-fin-reserve': FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
        goalfinreserve: FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
        life: FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
        'goal-life': FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
        goallife: FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
        pension: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION,
        'goal-pension': FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION,
        goalpension: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION,
        'passive-income': FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
        passiveincome: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
        rent: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
        'goal-passive-income': FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
        goalpassiveincome: FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
        investment: FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
        'save-and-grow': FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
        'goal-save-grow': FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
        goalsavegrow: FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
        other: FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
        'goal-other': FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
        goalother: FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
    };
    const requestedGoalPageType = GOAL_TYPE_TO_PAGE_TYPE[upper] || aliasGoalPageTypes[lower] || normalized;
    if (goalPageTypes.has(requestedGoalPageType)) {
        const goal =
            (goalId != null && model.goals.find((g) => Number(g?.goal_id) === Number(goalId))) ||
            model.goals.find((g) => goalPageType(g) === requestedGoalPageType);
        if (!goal) return null;
        return renderTemplatePage(requestedGoalPageType, goal);
    }

    const tailPageAliases = {
        'comon-autofollow': FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
        comonautofollow: FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
        'idu-strategies': FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES,
        idustrategies: FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES,
        'finam-offers': FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS,
        finamoffers: FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS,
        inflation: FINAM_REPORT_V2_PAGE_TYPES.INFLATION,
        roadmap: FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
        'risk-declaration': FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
        riskdeclaration: FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
        'partner-value': FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
        partnervalue: FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
    };
    const staticRenderers = {
        [FINAM_REPORT_V2_PAGE_TYPES.COVER]: FINAM_REPORT_V2_PAGE_TYPES.COVER,
        [FINAM_REPORT_V2_PAGE_TYPES.INTRO]: FINAM_REPORT_V2_PAGE_TYPES.INTRO,
        [FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE]: FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE,
        [FINAM_REPORT_V2_PAGE_TYPES.GOALS]: FINAM_REPORT_V2_PAGE_TYPES.GOALS,
        [FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY]: FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY,
        [FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW]: FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
        [FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES]: FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES,
        [FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS]: FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS,
        [FINAM_REPORT_V2_PAGE_TYPES.INFLATION]: FINAM_REPORT_V2_PAGE_TYPES.INFLATION,
        [FINAM_REPORT_V2_PAGE_TYPES.ROADMAP]: FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
        [FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN]: FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN,
        [FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION]: FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
        [FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE]: FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
    };
    const templatePageType = staticRenderers[normalized] || tailPageAliases[lower];
    return templatePageType ? renderTemplatePage(templatePageType) : null;
}

module.exports = {
    buildFinamReportV2HtmlPackage,
    buildFinamReportV2PageHtml,
    buildV2Model,
    filterGoals,
    goalPageType,
};
