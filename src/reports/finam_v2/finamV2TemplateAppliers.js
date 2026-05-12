const { FINAM_REPORT_V2_PAGE_TYPES } = require('./finamReportV2Contract');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function replaceAll(s, from, to) {
    if (!from) return s;
    if (from instanceof RegExp) return String(s).replace(from, String(to == null ? '' : to));
    return String(s).split(from).join(String(to == null ? '' : to));
}

function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function maxGoalYears(goals) {
    const months = (Array.isArray(goals) ? goals : []).reduce((max, goal) => {
        const value = finite(goal?.summary?.target_months ?? goal?.summary?.term_months ?? goal?.term_months, 0);
        return Math.max(max, value);
    }, 0);
    if (months <= 0) return '20+ лет';
    const years = Math.max(1, Math.round(months / 12));
    return years >= 20 ? '20+ лет' : `${years} лет`;
}

function goalTarget(goal) {
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

function goalInitial(goal) {
    return goal?.summary?.initial_capital ?? goal?.smart_initial_capital ?? goal?.initial_capital ?? 0;
}

function goalMonthly(goal) {
    return goal?.summary?.monthly_replenishment ?? goal?.monthly_replenishment ?? 0;
}

function goalTerm(goal) {
    const months = finite(goal?.summary?.target_months ?? goal?.summary?.term_months ?? goal?.term_months, 0);
    if (months <= 0) return '—';
    const years = Math.round(months / 12);
    return years > 0 ? `${years} лет` : `${months} мес.`;
}

function goalYield(goal) {
    const value = goal?.summary?.accumulation_yield_percent ?? goal?.pdf_metrics?.portfolio_yield_percent;
    return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : '—';
}

function goalName(goal, helpers) {
    if (!goal) return 'Цель';
    if (helpers?.goalDisplayName) return helpers.goalDisplayName(goal);
    return goal.goal_title_raw || goal.goal_name || goal.name || 'Цель';
}

function formatMoneyWith(helpers, value, opts) {
    if (helpers?.formatMoney) return helpers.formatMoney(value, opts);
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const formatted = opts?.short && abs >= 1000000
        ? `${(n / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`
        : `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    return opts?.perMonth ? `${formatted}/мес` : formatted;
}

function replaceCommonSamples(html, { model, helpers }) {
    const portfolioValue = formatMoneyWith(helpers, model?.portfolio?.projectedTotal || 0, { short: true });
    const initialValue = formatMoneyWith(helpers, model?.portfolio?.initialTotal || 0, { short: true });
    const monthlyValue = formatMoneyWith(helpers, model?.portfolio?.monthlyTotal || 0, { short: true });
    const monthlyValueFull = formatMoneyWith(helpers, model?.portfolio?.monthlyTotal || 0);
    const monthlyFull = formatMoneyWith(helpers, model?.portfolio?.monthlyTotal || 0, { short: true, perMonth: true });
    const advisor = model?.advisor || {};
    const clientName = escapeHtml(model?.client?.name || 'Клиент');
    const reportDate = escapeHtml(model?.client?.reportDate || '');
    const planningHorizon = escapeHtml(model?.client?.planningHorizon || maxGoalYears(model?.goals));
    const advisorName = escapeHtml(advisor.fullName || 'Финансовый консультант');
    const advisorEmail = escapeHtml(advisor.email || '—');
    const advisorPhone = escapeHtml(advisor.phone || '—');

    let out = String(html || '');
    const replacements = [
        ['Иван Иванович', clientName],
        ['Иван Иванов', clientName],
        ['Анна Смирнова', advisorName],
        ['advisor@finam.ru', advisorEmail],
        ['+7 999 000-00-00', advisorPhone],
        ['10 мая 2026', reportDate],
        ['12 мая 2026 г.', reportDate],
        ['12 мая 2026', reportDate],
        ['20+ лет', planningHorizon],
        ['72,4 млн ₽', portfolioValue],
        ['12,9 млн ₽', portfolioValue],
        ['56,6 млн ₽', portfolioValue],
        ['56,6 млн', portfolioValue.replace(/\s*₽$/, '')],
        ['24,7 млн ₽', portfolioValue],
        ['24,7 млн', portfolioValue.replace(/\s*₽$/, '')],
        ['16,4 млн ₽', portfolioValue],
        ['16,4 млн', portfolioValue.replace(/\s*₽$/, '')],
        ['5,0 млн ₽', initialValue],
        ['5,0 млн', initialValue.replace(/\s*₽$/, '')],
        ['1,5 млн ₽', initialValue],
        ['1,5 млн', initialValue.replace(/\s*₽$/, '')],
        [/(?<!\d)50 тыс ₽\/мес/g, monthlyFull],
        [/(?<!\d)50 тыс ₽/g, monthlyValue],
        [/(?<!\d)50 тыс(?!\s*₽)/g, monthlyValue.replace(/\s*₽$/, '')],
        ['85 000 ₽', monthlyValueFull],
        ['77 000 ₽', monthlyValueFull],
        ['3 000 ₽', '0 ₽'],
        ['3,9 млн', portfolioValue.replace(/\s*₽$/, '')],
        ['2,3 млн', portfolioValue.replace(/\s*₽$/, '')],
        ['7,2', portfolioValue && portfolioValue !== '—' ? portfolioValue.replace(/\s*₽$/, '') : '—'],
    ];
    for (const [from, to] of replacements) out = replaceAll(out, from, to);
    return out;
}

function replaceGoalSamples(html, { pageType, goal, helpers }) {
    if (!goal) return html;
    const title = escapeHtml(goalName(goal, helpers));
    const target = formatMoneyWith(helpers, goalTarget(goal), { short: true });
    const targetNoCurrency = target.replace(/\s*₽$/, '');
    const initial = formatMoneyWith(helpers, goalInitial(goal), { short: true });
    const initialNoCurrency = initial.replace(/\s*₽$/, '');
    const monthly = formatMoneyWith(helpers, goalMonthly(goal), { short: true });
    const monthlyFull = formatMoneyWith(helpers, goalMonthly(goal));
    const monthlyPerMonth = formatMoneyWith(helpers, goalMonthly(goal), { perMonth: true });
    const initialFull = formatMoneyWith(helpers, goalInitial(goal));
    const monthlyNoCurrency = monthly.replace(/\s*₽$/, '');
    const term = escapeHtml(goalTerm(goal));
    const yieldValue = escapeHtml(goalYield(goal));

    let out = String(html || '');
    const titleByType = {
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE]: ['Финансовый резерв'],
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE]: ['Защита жизни'],
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION]: ['Достойная пенсия', 'Пенсионная цель'],
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME]: ['Пассивный доход'],
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW]: ['Сохранить и приумножить'],
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER]: ['Крупная покупка', 'Крупная цель', 'Квартира'],
    };
    for (const sampleTitle of titleByType[pageType] || []) {
        out = replaceAll(out, sampleTitle, title);
    }

    const numericReplacements = [
        ['56,6 млн ₽', target],
        ['56,6 млн', targetNoCurrency],
        ['24,7 млн ₽', target],
        ['24,7 млн', targetNoCurrency],
        ['16,4 млн ₽', target],
        ['16,4 млн', targetNoCurrency],
        ['12,5 млн ₽', target],
        ['5,2 млн ₽', target],
        ['5,0 млн ₽', initial],
        ['5,0 млн', initialNoCurrency],
        ['1,5 млн ₽', initial],
        ['1,5 млн', initialNoCurrency],
        [/(?<!\d)50 тыс ₽\/мес/g, `${monthly}/мес`],
        [/(?<!\d)50 тыс ₽/g, monthly],
        [/(?<!\d)50 тыс(?!\s*₽)/g, monthlyNoCurrency],
        ['93&nbsp;408 ₽', initialFull],
        ['93 тыс', initialNoCurrency],
        ['6&nbsp;249 ₽', monthlyFull],
        ['377&nbsp;376 ₽/мес', monthlyPerMonth],
        ['377&nbsp;376 ₽', monthlyFull],
        ['377&nbsp;000 ₽/мес', monthlyPerMonth],
        ['377 тыс ₽', monthly],
        ['377,4 тыс ₽/мес', monthlyPerMonth],
        ['20 лет', term],
        ['10 лет', term],
    ];
    for (const [from, to] of numericReplacements) out = replaceAll(out, from, to);
    return out;
}

function applyTemplateData(html, context = {}) {
    let out = replaceCommonSamples(html, context);
    out = replaceGoalSamples(out, context);
    return out;
}

module.exports = {
    applyTemplateData,
};
