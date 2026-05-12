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
    [FINAM_REPORT_V2_PAGE_TYPES.SCENARIOS]: 'Сценарии',
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
    const raw =
        goal?.risk_profile_extended ||
        goal?.risk_profile_details?.risk_profile_extended ||
        goal?.risk_profile_details?.risk_profile ||
        goal?.risk_profile;
    const s = String(raw || '').toUpperCase();
    const labels = {
        CONSERVATIVE: 'Консервативный',
        MODERATELY_CONSERVATIVE: 'Умеренно-консервативный',
        MODERATE: 'Умеренный',
        MODERATELY_AGGRESSIVE: 'Умеренно-агрессивный',
        AGGRESSIVE: 'Агрессивный',
        LOW: 'Низкий',
        MEDIUM: 'Средний',
        HIGH: 'Высокий',
        '1': 'Консервативный',
        '2': 'Умеренный',
        '3': 'Агрессивный',
    };
    return labels[s] || (raw ? String(raw) : 'По анкете клиента');
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

function allocationFromPortfolio(items, totalValue, { monthly = false } = {}) {
    const list = Array.isArray(items) ? items : [];
    const rows = list
        .map((item) => {
            const percent = toFiniteNumber(item.share_percent ?? item.share ?? item.value, 0);
            const value = toFiniteNumber(item.amount, Number.isFinite(Number(totalValue)) ? (totalValue * percent) / 100 : 0);
            return {
                label: item.name || item.assetClass || 'Инструмент',
                percent,
                value,
                yieldPercent: item.yield_percent ?? item.yield,
            };
        })
        .filter((item) => item.percent > 0)
        .slice(0, 6);
    const totalPercent = rows.reduce((sum, item) => sum + item.percent, 0);
    if (rows.length && Math.abs(totalPercent - 100) > 0.01) {
        return rows.map((item) => ({ ...item, percent: Math.round((item.percent / totalPercent) * 1000) / 10 }));
    }
    if (!rows.length && totalValue > 0) {
        return [{ label: monthly ? 'Ежемесячные пополнения' : 'Стартовый капитал', percent: 100, value: totalValue }];
    }
    return rows;
}

function buildV2Model(report = {}, options = {}) {
    const goals = filterGoals(report.goals_detailed || [], options.goalTypes).sort((a, b) => goalSortWeight(a) - goalSortWeight(b));
    const clientName = report?.client_info?.full_name || report?.client_info?.first_name || 'Клиент';
    const portfolio = report?.overall_plan?.pdf_metrics?.portfolio || {};
    const familyContext = report?.family_page_ai_context || {};
    const initialTotal = toFiniteNumber(portfolio.total_initial_capital, 0);
    const monthlyTotal = toFiniteNumber(portfolio.total_monthly_replenishment, 0);
    const projectedTotal = toFiniteNumber(report?.overall_plan?.chart_waterfall?.total_projected, 0);
    const assetsTotal = toFiniteNumber(report?.current_situation?.assets_total, 0);
    const liabilitiesTotal = toFiniteNumber(report?.current_situation?.liabilities_total, 0);
    const netWorth = toFiniteNumber(report?.current_situation?.net_worth, assetsTotal - liabilitiesTotal);
    const cashflow = familyContext.cashflow_monthly_rub || {};
    const income = toFiniteNumber(cashflow.income ?? report?.client_info?.avg_monthly_income, 0);
    const obligations = toFiniteNumber(cashflow.obligations_total, 0);
    const plannedContributions = toFiniteNumber(cashflow.planned_pfp_contributions ?? monthlyTotal, monthlyTotal);
    const freeCashflow = Math.round(income - (obligations + plannedContributions));

    return {
        reportSchemaVersion: FINAM_REPORT_V2_SCHEMA_VERSION,
        client: {
            name: clientName,
            firstName: report?.client_info?.first_name || clientName,
            age: report?.client_info?.age,
            income,
            reportDate: formatDateRu(options.reportDate || new Date()),
        },
        advisor: options.advisor || {
            fullName: 'Финансовый консультант',
            email: '',
            phone: '',
        },
        currentState: {
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
        },
        goals,
        goalGroups: groupGoals(goals),
        overallPlan: report?.overall_plan || {},
        executiveSummary: {
            paragraphs: paragraphsFromText(report?.ai_executive_summary?.summary_text, 3),
            headline: projectedTotal > 0
                ? `План ведёт к капиталу ${formatMoney(projectedTotal, { short: true })}`
                : 'Финансовый план собран по актуальным целям клиента',
        },
        portfolio: {
            initialTotal,
            monthlyTotal,
            projectedTotal,
            expectedReturn: portfolio.estimated_portfolio_yield_percent,
            initialAllocation: allocationFromPortfolio(portfolio.assets_allocation, initialTotal),
            monthlyAllocation: allocationFromPortfolio(portfolio.cash_flow_allocation, monthlyTotal, { monthly: true }),
        },
        taxBenefits: report?.overall_plan?.tax_benefits || {},
        comonShowcase: report?.comon_showcase || null,
    };
}

function buildBaseCss() {
    const tokensCss = readLocalCss('tokens.css');
    const coverBg = localAssetDataUrl('assets/cover-bg.png');
    const aiAvatar = localAssetDataUrl('assets/avatar-ai-finam-v2.svg');
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
        [FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES]: ['Стратегии доверительного управления', 'ДУ подключается как управляемый слой портфеля, если продукт подходит цели, горизонту и риск-профилю клиента.'],
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

function renderScenarios(model) {
    const base = model.portfolio.projectedTotal || model.goals.reduce((sum, goal) => sum + toFiniteNumber(pickGoalTarget(goal), 0), 0);
    const scenarios = [
        ['Стресс', base > 0 ? formatMoney(base, { short: true }) : 'пересчёт', 'Проверить резерв и сократить второстепенные цели'],
        ['Базовый', base > 0 ? formatMoney(base, { short: true }) : 'план', 'Держать регулярные пополнения и квартальный контроль'],
        ['Ускорение', 'после решения', 'Направлять дополнительный свободный поток в долгие цели'],
    ];
    const cards = scenarios.map(([name, value, action]) => `<section class="finam-v2-prod__card">
      <div class="finam-v2-prod__label">${escapeHtml(name)}</div>
      <div class="finam-v2-prod__value">${escapeHtml(value)}</div>
      <p class="finam-v2-prod__small">${escapeHtml(action)}</p>
    </section>`).join('');
    const body = `${pageHeader('Сценарии')}
    <p class="finam-v2-prod__kicker">Базовый / стресс / ускорение</p>
    <h1 class="finam-v2-prod__title">Сценарии показывают запас прочности плана</h1>
    <div class="finam-v2-prod__grid-3">${cards}</div>
    <section class="finam-v2-prod__ai" style="margin-top: 16px;">
      <p class="finam-v2-prod__text">Сценарии не обещают доходность. Они показывают, как меняется план при дисциплине пополнений, просадке рынка или росте свободного потока.</p>
    </section>`;
    return wrapPage({ title: 'Сценарии', label: 'Сценарии', body });
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
    add(FINAM_REPORT_V2_PAGE_TYPES.SCENARIOS, renderScenarios(model));
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
} = {}) {
    const model = buildV2Model(report, { goalTypes, advisor });
    return buildFinamV2TemplatePackage({
        model,
        includeCover,
        includeSummary,
        includePartnerValue,
        helpers: buildTemplateHelpers(),
    });
}

async function buildFinamReportV2PageHtml({ report, pageType, goalId = null, goalTypes = null } = {}) {
    const model = buildV2Model(report, { goalTypes });
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
    if (upper === 'REPLENESHMENT' || upper === 'REPLENISHMENT' || normalized === FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN) {
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
        [FINAM_REPORT_V2_PAGE_TYPES.SCENARIOS]: FINAM_REPORT_V2_PAGE_TYPES.SCENARIOS,
        [FINAM_REPORT_V2_PAGE_TYPES.ROADMAP]: FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
        [FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION]: FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
        [FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE]: FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
    };
    const templatePageType = staticRenderers[normalized];
    return templatePageType ? renderTemplatePage(templatePageType) : null;
}

module.exports = {
    buildFinamReportV2HtmlPackage,
    buildFinamReportV2PageHtml,
    buildV2Model,
    filterGoals,
    goalPageType,
};
