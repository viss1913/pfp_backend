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

function moneyHtml(helpers, value, opts) {
    return escapeHtml(formatMoneyWith(helpers, value, opts)).replace(/\s/g, '&nbsp;');
}

function percentWidth(value, base) {
    const n = finite(value, 0);
    const d = finite(base, 0);
    if (d <= 0) return 0;
    return Math.max(0, Math.min(100, (n / d) * 100));
}

function formatRatioPercent(ratio) {
    const n = Number(ratio);
    if (!Number.isFinite(n)) return '—';
    return `${Math.round(n * 100).toLocaleString('ru-RU')}%`;
}

function pluralRu(n, one, few, many) {
    const value = Math.abs(Number(n) || 0);
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

function labelFromMap(value, map, fallback = '—') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const key = raw.toLowerCase();
    if (map[key]) return map[key];
    return raw
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^./, (ch) => ch.toUpperCase());
}

function maritalStatusLabel(value) {
    return labelFromMap(value, {
        single: 'Не в браке',
        married: 'В браке',
        divorced: 'В разводе',
        widowed: 'Вдовец / вдова',
        civil_union: 'Гражданский брак',
    });
}

function employmentTypeLabel(value) {
    return labelFromMap(value, {
        employee: 'Наёмный сотрудник',
        employed: 'Наёмный сотрудник',
        self_employed: 'Самозанятый',
        individual_entrepreneur: 'ИП',
        entrepreneur: 'Предприниматель',
        business_owner: 'Владелец бизнеса',
        civil_servant: 'Госслужащий',
        retired: 'Пенсионер',
        unemployed: 'Не работает',
    });
}

function obligationTypeLabel(value) {
    return labelFromMap(value, {
        credit: 'Кредиты',
        credits: 'Кредиты',
        loan: 'Кредиты',
        loans: 'Кредиты',
        mortgage: 'Ипотека',
        rent: 'Аренда',
        alimony: 'Алименты',
        education: 'Образование',
        parents: 'Родители',
        elder_support: 'Родители',
        family_support: 'Помощь семье',
        other: 'Прочее',
    }, 'Прочее');
}

function ageLabel(age) {
    const n = Number(age);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${Math.round(n)} ${pluralRu(Math.round(n), 'год', 'года', 'лет')}`;
}

function childrenLabel(children) {
    const list = Array.isArray(children) ? children : [];
    if (!list.length) return null;
    const names = list
        .slice(0, 3)
        .map((child) => {
            const name = child?.first_name ? String(child.first_name).trim() : '';
            const age = child?.age_years != null ? ageLabel(child.age_years) : '';
            return [name, age && age !== '—' ? age : ''].filter(Boolean).join(', ');
        })
        .filter(Boolean);
    const base = `${list.length} ${pluralRu(list.length, 'ребёнок', 'ребёнка', 'детей')}`;
    return names.length ? `${base}: ${names.join('; ')}` : base;
}

function rowHtml(label, value) {
    return `<div class="finam-v2-cs__row">
          <span class="finam-v2-cs__row-label">${escapeHtml(label)}</span>
          <span class="finam-v2-cs__row-value">${value}</span>
        </div>`;
}

function normalizeCurrentState(model) {
    const state = model?.currentState || {};
    const family = state.family || {};
    const familyClient = state.familyClient || {};
    const cashflow = state.cashflow || {};
    const obligationsRaw = Array.isArray(family.family_obligations) ? family.family_obligations : [];
    const obligations = obligationsRaw
        .map((item) => ({
            label: obligationTypeLabel(item?.type || item?.name),
            amount: finite(item?.amount_monthly ?? item?.amount, 0),
        }))
        .filter((item) => item.amount > 0);
    const obligationsTotalFromRows = obligations.reduce((sum, item) => sum + item.amount, 0);
    const income = finite(cashflow.income ?? state.income, 0);
    const obligationsTotal = finite(cashflow.obligations_total, obligationsTotalFromRows || finite(state.obligations, 0));
    const plannedPfp = finite(cashflow.planned_pfp_contributions ?? state.plannedContributions, 0);
    const freeCashflow = Math.round(income - (obligationsTotal + plannedPfp));
    const freeCashflowRatio = income > 0 ? freeCashflow / income : null;
    const goalLoadRatio = income > 0 ? plannedPfp / income : null;
    const largestObligation = obligations.reduce((max, item) => (item.amount > (max?.amount || 0) ? item : max), null);

    return {
        state,
        family,
        familyClient,
        obligations,
        income,
        obligationsTotal,
        plannedPfp,
        freeCashflow,
        freeCashflowRatio,
        goalLoadRatio,
        largestObligation,
        assetsTotal: finite(state.assetsTotal, 0),
        liabilitiesTotal: finite(state.liabilitiesTotal, 0),
        assetsBreakdown: Array.isArray(state.assetsBreakdown) ? state.assetsBreakdown : [],
    };
}

function cashflowScenario(current) {
    if (current.freeCashflow < 0) return 'negative';
    const ratio = Number(current.freeCashflowRatio);
    if (!Number.isFinite(ratio)) return 'critical';
    if (ratio < 0.05) return 'critical';
    if (ratio < 0.15) return 'thin';
    if (ratio < 0.30) return 'working';
    return 'strong';
}

function buildCurrentStateAiTexts(current, helpers) {
    const scenario = cashflowScenario(current);
    const free = moneyHtml(helpers, current.freeCashflow);
    const income = moneyHtml(helpers, current.income);
    const obligations = moneyHtml(helpers, current.obligationsTotal);
    const pfp = moneyHtml(helpers, current.plannedPfp);
    const ratio = formatRatioPercent(current.freeCashflowRatio);
    const deficit = moneyHtml(helpers, Math.abs(current.freeCashflow));
    const largest = current.largestObligation;
    const largestText = largest
        ? `<strong>${escapeHtml(largest.label)} ${moneyHtml(helpers, largest.amount)}</strong>`
        : '<strong>обязательства</strong>';

    const topByScenario = {
        negative: `Главный вывод: после обязательств ${obligations} и расходов на финансовый план ${pfp} семейный cash flow уходит в минус на <strong>${deficit}</strong>. Сначала выравниваем бюджет, потом наращиваем цели.`,
        critical: `Главный вывод: после обязательств ${obligations} и расходов на финансовый план ${pfp} остаётся <strong>${free}</strong> — около <strong>${ratio}</strong> доходов семьи. Запас прочности критически тонкий.`,
        thin: `Главный вывод: после обязательств ${obligations} и расходов на финансовый план ${pfp} остаётся <strong>${free}</strong> — около <strong>${ratio}</strong> доходов семьи. Поток рабочий, но требует контроля.`,
        working: `Главный вывод: семейный доход ${income} выдерживает обязательства и финансовый план: свободный cash flow — <strong>${free}</strong>, около <strong>${ratio}</strong> доходов. Можно планово двигаться к целям.`,
        strong: `Главный вывод: после обязательств и расходов на финансовый план остаётся <strong>${free}</strong> — около <strong>${ratio}</strong> доходов семьи. Запас сильный, можно ускорять приоритетные цели.`,
    };

    const bottomByScenario = {
        negative: `Коротко по рискам. Крупнейшая статья — ${largestText}. Следующий шаг — сократить или реструктурировать нагрузку и временно не запускать новые цели до выхода cash flow в плюс.`,
        critical: `Коротко по рискам. Крупнейшая статья — ${largestText}. При таком остатке приоритет — резерв, лимиты трат и проверка обязательств перед увеличением взносов.`,
        thin: `Коротко по рискам. Крупнейшая статья — ${largestText}. Свободный поток есть, но лучше держать резерв и пересматривать расходы перед запуском дополнительных целей.`,
        working: `Коротко по рискам. Крупнейшая статья — ${largestText}. Свободный поток позволяет выполнять план, если сохранить дисциплину расходов и не увеличивать долговую нагрузку.`,
        strong: `Коротко по рискам. Крупнейшая статья — ${largestText}. Бюджет устойчивый: часть свободного потока можно направить на ускорение целей или усиление резерва.`,
    };

    return {
        top: topByScenario[scenario],
        bottom: bottomByScenario[scenario],
    };
}

function buildCurrentStateGridHtml(current, helpers) {
    const age = current.familyClient.age ?? current.state?.age;
    const children = childrenLabel(current.family.children);
    const familyRows = [
        rowHtml('Семейное положение', escapeHtml(maritalStatusLabel(current.familyClient.marital_status))),
        rowHtml('Занятость', escapeHtml(employmentTypeLabel(current.familyClient.employment_type))),
        rowHtml('Возраст', escapeHtml(ageLabel(age))),
        children ? rowHtml('Дети', escapeHtml(children)) : null,
    ].filter(Boolean).join('\n        ');

    const assetRows = current.assetsBreakdown
        .filter((asset) => finite(asset?.value, 0) > 0)
        .slice(0, 2)
        .map((asset) => rowHtml(asset?.name || 'Актив', moneyHtml(helpers, asset.value)))
        .join('\n        ');
    const assetsHtml = `${assetRows || rowHtml('Активы к учёту', moneyHtml(helpers, current.assetsTotal))}
        <hr class="finam-v2-cs__card-hr" />
        ${rowHtml('Итого активы', moneyHtml(helpers, current.assetsTotal))}
        ${rowHtml('Долги', moneyHtml(helpers, current.liabilitiesTotal))}`;

    return `<div class="finam-v2-cs__grid-2">
      <div class="finam-v2-cs__card finam-v2-cs__card--family">
        <div class="finam-v2-cs__card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Семья
        </div>
        ${familyRows}
      </div>
      <div class="finam-v2-cs__card finam-v2-cs__card--assets">
        <div class="finam-v2-cs__card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM9 22V12h6v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Активы
        </div>
        ${assetsHtml}
      </div>
    </div>`;
}

function buildObligationsHtml(current, helpers) {
    const rows = current.obligations.slice(0, 7);
    const maxAmount = rows.reduce((max, item) => Math.max(max, item.amount), 0) || 1;
    const rowsHtml = rows.length
        ? rows.map((item) => `<div class="finam-v2-cs__bar-row">
          <span class="finam-v2-cs__bar-label">${escapeHtml(item.label)}</span>
          <div class="finam-v2-cs__bar-track">
            <div class="finam-v2-cs__bar-fill" style="width: ${percentWidth(item.amount, maxAmount).toFixed(3)}%;"></div>
          </div>
          <span class="finam-v2-cs__bar-val">${moneyHtml(helpers, item.amount)}</span>
        </div>`).join('\n        ')
        : `<div class="finam-v2-cs__bar-row">
          <span class="finam-v2-cs__bar-label">Нет</span>
          <div class="finam-v2-cs__bar-track">
            <div class="finam-v2-cs__bar-fill" style="width: 0%;"></div>
          </div>
          <span class="finam-v2-cs__bar-val">${moneyHtml(helpers, 0)}</span>
        </div>`;

    return `<div class="finam-v2-cs__obligations">
      <div class="finam-v2-cs__obligations-top">
        <div class="finam-v2-cs__section-head" style="margin-bottom: 0;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="finam-v2-cs__section-title">Главная нагрузка бюджета</span>
        </div>
        <span class="finam-v2-cs__section-head-right">Итого: ${moneyHtml(helpers, current.obligationsTotal, { perMonth: true })}</span>
      </div>
      <div class="finam-v2-cs__bar-card finam-v2-cs__bar-card--dense">
        ${rowsHtml}
      </div>
    </div>`;
}

function balanceRowHtml({ label, value, width, fillClass, helpers, accent = false, negative = false }) {
    const style = negative ? ' style="color: #b91c1c;"' : '';
    return `<div class="finam-v2-cs__balance-row">
        <span class="finam-v2-cs__balance-label${accent ? ' finam-v2-cs__balance-label--emph' : ''}">${escapeHtml(label)}</span>
        <div class="finam-v2-cs__balance-track">
          <div class="finam-v2-cs__balance-fill ${fillClass}" style="width: ${Math.max(0, width).toFixed(3)}%;"></div>
        </div>
        <span class="finam-v2-cs__balance-val${accent ? ' finam-v2-cs__balance-val--accent' : ''}"${style}>${moneyHtml(helpers, value)}</span>
      </div>`;
}

function buildBalanceHtml(current, helpers) {
    const base = current.income > 0 ? current.income : Math.max(current.obligationsTotal + current.plannedPfp + Math.max(current.freeCashflow, 0), 1);
    return `<div class="finam-v2-cs__balance">
      <div class="finam-v2-cs__balance-head">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
          <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="finam-v2-cs__balance-title">Свободный поток определяет скорость целей</span>
      </div>
      ${balanceRowHtml({ label: 'Доходы семьи', value: current.income, width: current.income > 0 ? 100 : 0, fillClass: 'finam-v2-cs__balance-fill--income', helpers })}
      ${balanceRowHtml({ label: 'Обязательства', value: current.obligationsTotal, width: percentWidth(current.obligationsTotal, base), fillClass: 'finam-v2-cs__balance-fill--obl', helpers })}
      ${balanceRowHtml({ label: 'Расходы на финплан', value: current.plannedPfp, width: percentWidth(current.plannedPfp, base), fillClass: 'finam-v2-cs__balance-fill--pfp', helpers })}
      <hr class="finam-v2-cs__balance-sep" />
      ${balanceRowHtml({
        label: 'Свободно',
        value: current.freeCashflow,
        width: percentWidth(Math.max(current.freeCashflow, 0), base),
        fillClass: 'finam-v2-cs__balance-fill--free',
        helpers,
        accent: true,
        negative: current.freeCashflow < 0,
      })}
    </div>`;
}

function replaceBlockBefore(out, blockClass, nextClass, replacement) {
    const re = new RegExp(`<div class="${blockClass}">[\\s\\S]*?\\n\\s*<div class="${nextClass}">`);
    return out.replace(re, () => `${replacement}\n\n    <div class="${nextClass}">`);
}

function replaceCurrentStatePage(html, { model, helpers }) {
    const current = normalizeCurrentState(model);
    const ai = buildCurrentStateAiTexts(current, helpers);
    let out = String(html || '');

    out = out.replace(
        /(<div class="finam-v2-cs__bubble" data-finam-ai-page3="1">\s*)<p>[\s\S]*?<\/p>(\s*<\/div>)/,
        (_match, before, after) => `${before}<p>${ai.top}</p>${after}`
    );
    out = out.replace(
        /(<div class="finam-v2-cs__expert-bubble" data-finam-ai-page3="2">\s*)<p>[\s\S]*?<\/p>/,
        (_match, before) => `${before}<p>${ai.bottom}</p>`
    );
    out = replaceBlockBefore(out, 'finam-v2-cs__grid-2', 'finam-v2-cs__obligations', buildCurrentStateGridHtml(current, helpers));
    out = replaceBlockBefore(out, 'finam-v2-cs__obligations', 'finam-v2-cs__balance', buildObligationsHtml(current, helpers));
    out = replaceBlockBefore(out, 'finam-v2-cs__balance', 'finam-v2-cs__insight-row', buildBalanceHtml(current, helpers));
    return out;
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
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE) {
        out = replaceCurrentStatePage(out, context);
    }
    return out;
}

module.exports = {
    applyTemplateData,
};
