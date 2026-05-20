/**
 * Динамическое наполнение листов Финам-PDF (стр. целей, итоговый портфель, налоги).
 */

const { finamTemplateLabel, includesAny, normalizeText, resolveGoalTemplateFile } = require('./finamGoalTemplates');

function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function matchesEducationScenarioLabel(goal) {
    const label = finamTemplateLabel(goal);
    const n = normalizeText(label);
    return includesAny(n, ['образован', 'ребенк', 'ребёнк']);
}

function goalPriority(goal) {
    const p = toNum(goal?.priority);
    return Number.isFinite(p) ? p : 9999;
}

/**
 * Порядок целей в PDF Финам: резерв → жизнь → пенсия/пассив/рента → образование → остальные.
 * Внутри группы: priority ↑, затем исходный индекс.
 */
function orderFinamGoalsForPdf(goals) {
    const list = Array.isArray(goals) ? goals : [];
    const withIdx = list.map((g, i) => ({ g, i }));

    const bucket = (goal) => {
        const type = String(goal?.goal_type || '').toUpperCase();
        const id = Number(goal?.goal_type_id);
        if (type === 'FIN_RESERVE' || id === 7) return 0;
        if (type === 'LIFE' || id === 5) return 1;
        if (type === 'PENSION' || id === 1) return 2;
        if (type === 'PASSIVE_INCOME' || type === 'RENT' || id === 2 || id === 8) return 2;
        if (type === 'OTHER' || type === 'INVESTMENT') {
            if (matchesEducationScenarioLabel(goal)) return 3;
            return 4;
        }
        return 4;
    };

    withIdx.sort((a, b) => {
        const ba = bucket(a.g);
        const bb = bucket(b.g);
        if (ba !== bb) return ba - bb;
        const pa = goalPriority(a.g);
        const pb = goalPriority(b.g);
        if (pa !== pb) return pa - pb;
        return a.i - b.i;
    });

    return withIdx.map((x) => x.g);
}

function formatMoneyValue(value) {
    return `${Math.round(toNum(value)).toLocaleString('ru-RU')} ₽`;
}

function formatMoneyValueShort(value, suffix = '') {
    const n = Math.round(toNum(value));
    return `${n.toLocaleString('ru-RU')} ₽${suffix}`;
}

function computeGoalFacts(goal) {
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    const initial = toNum(summary.initial_capital ?? details.initial_capital);
    const monthly = toNum(
        summary.monthly_replenishment ??
            details.monthly_replenishment ??
            (String(goal?.goal_type || '').toUpperCase() === 'LIFE' ? toNum(details.annual_premium) / 12 : 0)
    );
    const months = Math.max(0, Math.round(toNum(summary.target_months ?? summary.term_months ?? details.term_months)));
    const totalCapital = toNum(
        summary.projected_capital_at_end ??
            summary.projected_capital_at_retirement ??
            summary.total_capital_at_end ??
            summary.target_amount_future ??
            summary.expected_cash_value ??
            summary.target_amount_initial
    );
    const retirementYear = toNum(details?.state_pension?.retirement_year);
    return {
        initial,
        monthly,
        months,
        totalCapital,
        retirementYear: Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : null,
    };
}

function goalCardImagePlaceholder(goal) {
    const file = resolveGoalTemplateFile(goal);
    const map = {
        'goal-page-fin-reserve-finam.html': 'goal-reserve.webp',
        'goal-page-life-finam.html': 'goal-life.webp',
        'goal-page-pension-finam.html': 'goal-pension.webp',
        'goal-page-passive-income-finam.html': 'goal-pension.webp',
        'goal-page-save-grow-finam.html': 'goal-grow.webp',
        'goal-page-education-finam.html': 'goal-education.webp',
        'goal-page-apartment-finam.html': 'goal-apartment.webp',
        'goal-page-house-finam.html': 'goal-house.webp',
        'goal-page-business-finam.html': 'goal-grow.webp',
        'goal-page-capital-finam.html': 'goal-grow.webp',
        'goal-page-travel-finam.html': 'goal-rent.webp',
        'goal-page-car-finam.html': 'goal-rent.webp',
    };
    return map[file] || 'goal-grow.webp';
}

function goalTypeTagClassAndLabel(goal) {
    const type = String(goal?.goal_type || '').toUpperCase();
    const id = Number(goal?.goal_type_id);
    if (type === 'FIN_RESERVE' || id === 7) return { cls: 'protection', label: 'Защита' };
    if (type === 'LIFE' || id === 5) return { cls: 'protection', label: 'Защита' };
    if (type === 'PENSION' || id === 1) return { cls: 'passive', label: 'Пенсия' };
    if (type === 'PASSIVE_INCOME' || type === 'RENT' || id === 2 || id === 8) {
        if (type === 'RENT' || id === 8) return { cls: 'rent', label: 'Рента' };
        return { cls: 'passive', label: 'Пассивный доход' };
    }
    if (type === 'INVESTMENT' || type === 'INHERITANCE' || id === 3 || id === 11) return { cls: 'growth', label: 'Рост капитала' };
    return { cls: '', label: 'Цель' };
}

function lifeTotalCoverageRub(goal) {
    const risks = Array.isArray(goal?.details?.risks) ? goal.details.risks : [];
    if (risks.length === 0) return null;
    const sum = risks.reduce((s, r) => s + toNum(r?.limit_amount), 0);
    return sum > 0 ? sum : null;
}

function buildGoalSectionHtml(goal, opts = {}) {
    const { showArrowAfter = true } = opts;
    const title = escapeHtml(finamTemplateLabel(goal) || goal?.goal_name || 'Цель');
    const facts = computeGoalFacts(goal);
    const type = String(goal?.goal_type || '').toUpperCase();
    const tag = goalTypeTagClassAndLabel(goal);
    const imgPh = goalCardImagePlaceholder(goal);

    const monthsStr = facts.months > 0 ? `${facts.months} мес.` : '—';
    const subtitle = escapeHtml(
        type === 'PENSION' || type === 'PASSIVE_INCOME'
            ? facts.retirementYear
                ? `Горизонт до ${facts.retirementYear} г. · ${monthsStr}`
                : `Горизонт · ${monthsStr}`
            : `Срок · ${monthsStr}`
    );

    const commentParts = [];
    if (facts.initial > 0) commentParts.push(`Старт ${formatMoneyValue(facts.initial)}`);
    if (facts.monthly > 0) commentParts.push(`взнос ${formatMoneyValueShort(facts.monthly, '/мес')}`);
    if (facts.totalCapital > 0) commentParts.push(`капитал к сроку ${formatMoneyValue(facts.totalCapital)}`);
    const commentText = commentParts.length > 0 ? commentParts.join(', ') : 'Параметры цели из расчёта финплана.';
    const commentInner = escapeHtml(commentText);

    const formulaLeadValue = (() => {
        if (facts.retirementYear) return String(facts.retirementYear);
        if (facts.months > 0) {
            if (facts.months % 12 === 0) {
                return `${Math.round(facts.months / 12)} г.`;
            }
            return `${facts.months} мес.`;
        }
        return '—';
    })();

    let tailHtml = '';
    if (type === 'FIN_RESERVE' || Number(goal?.goal_type_id) === 7) {
        tailHtml = `
      <div class="goal-data-protection">
        <div class="protection-icon">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <span class="protection-label">Целевой капитал</span>
        <span class="protection-value">${formatMoneyValue(facts.totalCapital)}</span>
      </div>`;
    } else if (type === 'LIFE' || Number(goal?.goal_type_id) === 5) {
        const cov = lifeTotalCoverageRub(goal);
        tailHtml = `
      <div class="goal-data-protection">
        <div class="protection-icon">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
        <span class="protection-label">Покрытие (сумма лимитов)</span>
        <span class="protection-value">${cov != null ? formatMoneyValue(cov) : formatMoneyValue(facts.totalCapital)}</span>
      </div>`;
    } else {
        tailHtml = `
      <div class="goal-formula">
        <div class="formula-block" style="flex:0.55;">
          <div class="formula-value">${escapeHtml(formulaLeadValue)}</div>
          <div class="formula-label">Год / срок</div>
        </div>
        <div class="formula-arrow">→</div>
        <div class="formula-block">
          <div class="formula-value">${formatMoneyValueShort(facts.initial)}</div>
          <div class="formula-label">Начальный</div>
        </div>
        <div class="formula-plus">+</div>
        <div class="formula-block">
          <div class="formula-value">${formatMoneyValueShort(facts.monthly, '/мес')}</div>
          <div class="formula-label">Пополнение</div>
        </div>
        <div class="formula-arrow">→</div>
        <div class="formula-block accent">
          <div class="formula-value">${formatMoneyValue(facts.totalCapital)}</div>
          <div class="formula-label">Капитал</div>
        </div>
      </div>`;
    }

    const tagClass = tag.cls ? ` ${tag.cls}` : '';
    const section = `
    <div class="goal-section">
      <div class="goal-card">
        <div class="goal-text">
          <div class="goal-header">
            <div class="goal-ai-avatar">
              <svg viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
            </div>
            <div class="goal-type-tag${tagClass}">${escapeHtml(tag.label)}</div>
          </div>
          <div class="goal-title">${title}</div>
          <div class="goal-subtitle">${subtitle}</div>
          <div class="goal-comment"><em>${commentInner}</em></div>
        </div>
        <div class="goal-image">
          <div class="goal-image-placeholder">./assets/<br>${escapeHtml(imgPh)}</div>
        </div>
      </div>
${tailHtml}
    </div>`;

    const arrow = showArrowAfter
        ? `\n    <div class="goal-arrow"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></div>\n`
        : '';
    return section + arrow;
}

const PIE_COLORS = ['#10b981', '#ec4899', '#6366f1', '#f59e0b', '#818cf8', '#f472b6', '#14b8a6', '#f97316'];

function buildSummaryPiesHtml(goals) {
    if (!goals.length) {
        return `
    <div class="section-tag">Итого по всем целям</div>
    <div class="summary"><p style="font-size:8px;color:#555;">Нет целей в отчёте.</p></div>`;
    }
    /** Первый пирог: доли первоначального капитала по целям (как в карточке «Начальный»). */
    const initials = goals.map((g) => Math.max(0, computeGoalFacts(g).initial));
    const monthlies = goals.map((g) => Math.max(0, computeGoalFacts(g).monthly));
    const sumI = initials.reduce((a, b) => a + b, 0);
    const sumM = monthlies.reduce((a, b) => a + b, 0);

    const labels = goals.map((g) => escapeHtml((finamTemplateLabel(g) || g?.goal_name || 'Цель').slice(0, 28)));

    function conicFromShares(shares, total) {
        let acc = 0;
        const parts = [];
        for (let i = 0; i < shares.length; i += 1) {
            const pct = total > 0 ? (shares[i] / total) * 100 : 100 / shares.length;
            const start = acc;
            acc += pct;
            parts.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${start}% ${acc}%`);
        }
        return parts.length ? parts.join(', ') : '#e5e7eb 0% 100%';
    }

    const centerInitial =
        sumI >= 1_000_000
            ? `${(sumI / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`
            : `${Math.round(sumI).toLocaleString('ru-RU')}`;
    const centerMonthly = `${Math.round(sumM).toLocaleString('ru-RU')}`;

    const legendInitial = goals
        .map((g, i) => {
            const pct =
                sumI > 0 ? Math.round((initials[i] / sumI) * 1000) / 10 : Math.round(1000 / goals.length) / 10;
            return `<div class="legend-item"><div class="legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></div><span class="legend-name">${labels[i]}</span><span class="legend-pct">${pct}%</span></div>`;
        })
        .join('');

    const legendMon = goals
        .map((g, i) => {
            const pct =
                sumM > 0 ? Math.round((monthlies[i] / sumM) * 1000) / 10 : Math.round(1000 / goals.length) / 10;
            return `<div class="legend-item"><div class="legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></div><span class="legend-name">${labels[i]}</span><span class="legend-pct">${pct}%</span></div>`;
        })
        .join('');

    return `
    <div class="section-tag">Итого по всем целям</div>
    <div class="summary">
      <div class="pie-card">
        <div class="pie-title">Распределение первоначального капитала</div>
        <div class="pie-wrapper pie-wrapper--wide">
          <div class="pie-circle pie-circle--large" style="background: conic-gradient(${conicFromShares(initials, sumI)});">
            <div class="pie-total">
              <div class="pie-total-value">${escapeHtml(centerInitial)}</div>
              <div class="pie-total-label">₽</div>
            </div>
          </div>
          <div class="pie-legend">${legendInitial}</div>
        </div>
      </div>
      <div class="pie-card">
        <div class="pie-title">Пополнение капитала по целям</div>
        <div class="pie-wrapper pie-wrapper--wide">
          <div class="pie-circle pie-circle--large" style="background: conic-gradient(${conicFromShares(monthlies, sumM)});">
            <div class="pie-total">
              <div class="pie-total-value">${escapeHtml(centerMonthly)}</div>
              <div class="pie-total-label">₽/мес</div>
            </div>
          </div>
          <div class="pie-legend">${legendMon}</div>
        </div>
      </div>
    </div>`;
}

function page4Footer() {
    return `
    <div class="spacer"></div>
    <footer class="footer">
      <div class="footer-left">
        Персональный финансовый план · Конфиденциально<br>
        Все партнёры осуществляют деятельность на основании лицензий ЦБ РФ
      </div>
      <div class="footer-right">
        Информация не является индивидуальной<br>
        инвестиционной рекомендацией
      </div>
    </footer>`;
}

function page4Header(pageIdx, totalPages) {
    return `
    <header class="header">
      <div class="logo-mark">
        <div class="logo-dot"></div>
        <span class="logo-text">Финансовый план</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="page-num">стр. ${pageIdx} из ${totalPages}</span>
        <div class="doc-label">Цели</div>
      </div>
    </header>
    <div class="divider"></div>`;
}

function goalsCountLabelRu(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'финансовая цель';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'финансовые цели';
    return 'финансовых целей';
}

/** Первая страница блока «Цели»: вводный speech + карточки (без диаграмм при 3+ целях). */
const FINAM_PAGE4_GOALS_PAGE1 = 4;
/** Промежуточные листы только с целями (без вводного блока). */
const FINAM_PAGE4_GOALS_MIDDLE = 3;
/** Сколько целей максимум оставить на последнем листе вместе с «Итого по всем целям» (два пирога + легенды). */
const FINAM_PAGE4_GOALS_LAST_WITH_SUMMARY = 2;

/**
 * Разбивает цели на несколько «листов» A4: первый — с ИИ-вводом, последний — с пирогами, между — только цели.
 */
function splitFinamPage4GoalChunks(goals) {
    const list = Array.isArray(goals) ? goals : [];
    const n = list.length;
    if (n === 0) {
        return [{ intro: true, pies: true, goals: [] }];
    }

    // Правила компоновки по количеству целей:
    // 1) 2 цели -> диаграммы на первой странице.
    // 2) 3-4 цели -> диаграммы на следующей странице.
    // 3) 5 целей -> 4 на первой, 5-я + диаграммы на второй.
    if (n <= 2) {
        return [{ intro: true, pies: true, goals: list.slice() }];
    }
    if (n === 3 || n === 4) {
        return [
            { intro: true, pies: false, goals: list.slice() },
            { intro: false, pies: true, goals: [] },
        ];
    }
    if (n === 5) {
        return [
            { intro: true, pies: false, goals: list.slice(0, 4) },
            { intro: false, pies: true, goals: list.slice(4) },
        ];
    }

    const takeFirst = Math.min(FINAM_PAGE4_GOALS_PAGE1, n);
    const chunks = [{ intro: true, pies: false, goals: list.slice(0, takeFirst) }];
    let i = takeFirst;

    while (i < n) {
        const left = n - i;
        if (left <= FINAM_PAGE4_GOALS_LAST_WITH_SUMMARY) {
            chunks.push({ intro: false, pies: true, goals: list.slice(i) });
            break;
        }
        const take = Math.min(FINAM_PAGE4_GOALS_MIDDLE, left - FINAM_PAGE4_GOALS_LAST_WITH_SUMMARY);
        if (take < 1) {
            chunks.push({ intro: false, pies: true, goals: list.slice(i) });
            break;
        }
        chunks.push({ intro: false, pies: false, goals: list.slice(i, i + take) });
        i += take;
    }

    // Избегаем «сиротских» страниц с одной целью без пирогов.
    // Если средний чанк получил 1 цель, перебрасываем по одной цели из предыдущих чанков.
    for (let ci = 1; ci < chunks.length - 1; ci += 1) {
        const chunk = chunks[ci];
        if (chunk.pies || chunk.goals.length !== 1) continue;
        for (let prev = ci - 1; prev >= 0; prev -= 1) {
            if (chunks[prev].goals.length > 1) {
                chunk.goals.unshift(chunks[prev].goals.pop());
                break;
            }
        }
    }

    return chunks;
}

function buildFinamPage4IntroHtml(allGoals) {
    const n = allGoals.length;
    const introText =
        n === 0
            ? 'Цели в отчёте пока не заданы.'
            : `У вас <em>${n}</em> ${goalsCountLabelRu(n)}. Ниже — краткий обзор по данным расчёта.`;
    return `
    <div class="avatar-section">
      <div class="avatar"><span class="avatar-text">ИИ</span></div>
      <div class="speech">
        <p>${introText}</p>
      </div>
    </div>`;
}

function buildFinamPage4BodyInner(goals) {
    const list = Array.isArray(goals) ? goals : [];
    const chunks = splitFinamPage4GoalChunks(list);
    const totalPages = chunks.length;
    const n = list.length;

    let globalGoalIndex = 0;
    const articles = chunks.map((chunk, pageIdx) => {
        const pageNum = pageIdx + 1;
        let body = '';

        if (chunk.intro) {
            body += buildFinamPage4IntroHtml(list);
        }

        chunk.goals.forEach((g, j) => {
            const isLastOverall = globalGoalIndex >= n - 1;
            const isLastInChunk = j === chunk.goals.length - 1;
            const piesFollow = Boolean(chunk.pies && isLastInChunk);
            const showArrowAfter = !isLastOverall && !piesFollow;
            body += buildGoalSectionHtml(g, { showArrowAfter });
            globalGoalIndex += 1;
        });

        if (chunk.pies) {
            body += buildSummaryPiesHtml(list);
        }

        const footer = pageIdx === totalPages - 1 ? page4Footer() : '';

        return `<article class="page">
  <div class="content">
${page4Header(pageNum, totalPages)}
${body}
${footer}
  </div>
</article>`;
    });

    return articles.join('\n\n');
}

function applyFinamPage4TargetsFromReport(html, orderedGoals) {
    if (!html || typeof html !== 'string') return html;
    const inner = buildFinamPage4BodyInner(orderedGoals);
    return html.replace(/<body([^>]*)>[\s\S]*<\/body>/i, (_, attrs) => `<body${attrs || ''}>\n${inner}\n</body>`);
}

/**
 * PDF: один iframe = один лист. Если в &lt;body&gt; несколько &lt;article class="page"&gt;,
 * режем на отдельные полные HTML-документа (общий head/styles на каждый).
 */
function splitFinamPage4IntoStandalonePages(fullHtml) {
    if (!fullHtml || typeof fullHtml !== 'string') return [fullHtml];
    const match = fullHtml.match(/^([\s\S]*<body[^>]*>)([\s\S]*)(<\/body>[\s\S]*)$/i);
    if (!match) return [fullHtml];
    const [, preBody, bodyInner, postBody] = match;
    const articleRe = /<article[^>]*class="[^"]*\bpage\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
    const articles = bodyInner.match(articleRe);
    if (!Array.isArray(articles) || articles.length <= 1) return [fullHtml];
    return articles.map((article) => `${preBody}\n${article.trim()}\n${postBody}`);
}

function sharesToRubles(items, totalRub) {
    const total = Math.max(0, Math.round(toNum(totalRub)));
    if (!Array.isArray(items) || items.length === 0) {
        return { segments: [] };
    }
    const shares = items.map((it) => Math.max(0, toNum(it?.share_percent ?? it?.share)));
    const sumShares = shares.reduce((a, b) => a + b, 0);
    const norm = sumShares > 0 ? shares.map((s) => (s / sumShares) * 100) : shares.map(() => 100 / items.length);

    let amounts = norm.map((p) => Math.round((total * p) / 100));
    const drift = total - amounts.reduce((a, b) => a + b, 0);
    if (amounts.length > 0) amounts[amounts.length - 1] += drift;

    const names = items.map((it) => String(it?.name || 'Класс').trim() || 'Класс');
    const segments = norm.map((p, i) => ({
        pct: Math.round(p * 10) / 10,
        name: names[i],
        amount: amounts[i],
    }));
    return { segments };
}

const DONUT_PALETTE = [
    ['#3b82f6', '#1e40af'],
    ['#a78bfa', '#5b21b6'],
    ['#e9d5ff', '#9333ea'],
    ['#34d399', '#047857'],
    ['#f59e0b', '#b45309'],
    ['#f472b6', '#be185d'],
    ['#38bdf8', '#0369a1'],
    ['#fcd34d', '#ca8a04'],
];

function buildDonutSvgAnnulus(segments, idPrefix) {
    const cx = 50;
    const cy = 50;
    const R = 42;
    const r = 24;
    let angle = -Math.PI / 2;
    const defs = [];
    const paths = [];

    const totalPct = segments.reduce((s, seg) => s + seg.pct, 0) || 1;

    segments.forEach((seg, i) => {
        const frac = seg.pct / totalPct;
        if (frac <= 0) return;
        const sweep = frac * 2 * Math.PI;
        const sa = angle;
        const ea = angle + sweep;
        angle = ea;

        const x1 = cx + R * Math.cos(sa);
        const y1 = cy + R * Math.sin(sa);
        const x2 = cx + R * Math.cos(ea);
        const y2 = cy + R * Math.sin(ea);
        const x3 = cx + r * Math.cos(ea);
        const y3 = cy + r * Math.sin(ea);
        const x4 = cx + r * Math.cos(sa);
        const y4 = cy + r * Math.sin(sa);
        const large = sweep > Math.PI ? 1 : 0;

        const [c1, c2] = DONUT_PALETTE[i % DONUT_PALETTE.length];
        const gid = `${idPrefix}-g${i}`;
        defs.push(
            `<linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient>`
        );
        const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
        paths.push(`<path d="${d}" fill="url(#${gid})" stroke="#ffffff" stroke-width="1.35"/>`);
    });

    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs.join('')}</defs><g paint-order="stroke fill">${paths.join('')}</g></svg>`;
}

function formatDonutCenterRub(value) {
    const n = Math.abs(toNum(value));
    if (n >= 1_000_000) {
        const m = n / 1_000_000;
        const s = m.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return `${s} млн р.`;
    }
    if (n >= 1000) {
        const k = n / 1000;
        const s = k.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return `${s} тыс р.`;
    }
    return `${Math.round(n).toLocaleString('ru-RU')} р.`;
}

function buildPortfolioInitialInject(segments, totalInit, uid) {
    if (!segments.length || totalInit <= 0) return null;
    const svg = buildDonutSvgAnnulus(
        segments.map((s) => ({ pct: s.pct })),
        `${uid}-i`
    );
    const legend = segments
        .map(
            (s, i) => `
        <div class="total-legend-row">
          <span class="total-dot total-dot--${(i % 4) + 1}" style="background:${DONUT_PALETTE[i % DONUT_PALETTE.length][0]}" aria-hidden="true"></span>
          <span><span class="total-name">${escapeHtml(s.name)}</span> — <span class="total-pct">${Math.round(s.pct * 10) / 10}%</span> <span class="total-meta">· ${escapeHtml(Math.round(s.amount).toLocaleString('ru-RU'))} ₽</span></span>
        </div>`
        )
        .join('');
    return `
      <div class="total-layout">
        <div class="donut-wrap">
          ${svg}
          <div class="donut-center">
            <span class="donut-center-sum">${escapeHtml(formatDonutCenterRub(totalInit))}</span>
          </div>
        </div>
        <div class="total-legend">${legend}</div>
      </div>`;
}

function buildPortfolioContribInject(segments, totalMo, uid) {
    if (!segments.length || totalMo <= 0) return null;
    const svg = buildDonutSvgAnnulus(
        segments.map((s) => ({ pct: s.pct })),
        `${uid}-c`
    );
    const legend = segments
        .map(
            (s, i) => `
        <div class="total-legend-row">
          <span class="total-dot total-dot--${i === 0 ? 'dep' : ((i % 3) + 1)}" style="background:${DONUT_PALETTE[i % DONUT_PALETTE.length][0]}" aria-hidden="true"></span>
          <span><span class="total-name">${escapeHtml(s.name)}</span> — <span class="total-pct">${Math.round(s.pct * 10) / 10}%</span> <span class="total-meta">· ${escapeHtml(Math.round(s.amount).toLocaleString('ru-RU'))} ₽/мес</span></span>
        </div>`
        )
        .join('');
    return `
      <div class="total-layout">
        <div class="donut-wrap donut-wrap--sm">
          ${svg}
          <div class="donut-center">
            <span class="donut-center-sum">${escapeHtml(formatDonutCenterRub(totalMo))}</span>
          </div>
        </div>
        <div class="total-legend">${legend}</div>
      </div>`;
}

function buildPortfolioNoDataInject(label) {
    return `
      <div class="total-layout">
        <div class="donut-wrap">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="#e5e7eb"></circle>
            <circle cx="50" cy="50" r="24" fill="#ffffff"></circle>
          </svg>
          <div class="donut-center">
            <span class="donut-center-sum">—</span>
          </div>
        </div>
        <div class="total-legend">
          <div class="total-legend-row">
            <span class="total-dot" style="background:#d1d5db" aria-hidden="true"></span>
            <span><span class="total-name">${escapeHtml(label)}</span> — <span class="total-meta">данные расчёта недоступны</span></span>
          </div>
        </div>
      </div>`;
}

function applyFinamPortfolioFinalPage(html, report) {
    if (!html || typeof html !== 'string') return html;
    const p = report?.overall_plan?.pdf_metrics?.portfolio;
    const itemsInitial = Array.isArray(p?.assets_allocation) ? p.assets_allocation : [];
    const itemsFlow = Array.isArray(p?.cash_flow_allocation) ? p.cash_flow_allocation : [];
    const totalInit = toNum(p?.total_initial_capital);
    const totalMo = toNum(p?.total_monthly_replenishment);

    const init = sharesToRubles(itemsInitial, totalInit);
    const flow = sharesToRubles(itemsFlow, totalMo);
    const uid = `pff-${Date.now().toString(36)}`;

    let out = html;
    const iniInject = init.segments.length > 0 && totalInit > 0 ? buildPortfolioInitialInject(init.segments, totalInit, uid) : null;
    const cfInject = flow.segments.length > 0 && totalMo > 0 ? buildPortfolioContribInject(flow.segments, totalMo, uid) : null;
    out = out.replace(
        /<!-- @finam-portfolio-initial -->[\s\S]*?<!-- \/@finam-portfolio-initial -->/,
        iniInject || buildPortfolioNoDataInject('Начальный капитал')
    );
    out = out.replace(
        /<!-- @finam-portfolio-contrib -->[\s\S]*?<!-- \/@finam-portfolio-contrib -->/,
        cfInject || buildPortfolioNoDataInject('Портфель пополнений')
    );

    if (!iniInject || !cfInject) {
        console.warn('[finamPdfPageAppliers] PORTFOLIO_FINAL: missing or empty portfolio pdf_metrics, used fallback');
    }

    return out;
}

function formatMoneyTax(value) {
    const n = toNum(value);
    const s = n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${s} ₽`;
}

function buildTaxTbodyYear(tax, yearLabel) {
    const pds = tax.pds_benefits || {};
    const iis = tax.iis_benefits || {};
    const nsj = tax.nsj_benefits || {};
    const ch = tax.children_benefits || {};
    const totals = tax.totals || {};

    const rows = [];
    const add = (label, v) => {
        if (toNum(v) <= 0) return;
        rows.push(`<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(formatMoneyTax(v))}</td></tr>`);
    };
    add('Вычет за ПДС', pds.deduction_2026);
    add('Вычет за ИИС', iis.deduction_2026);
    add('Вычет за НСЖ', nsj.deduction_2026);
    add('Вычет на детей', ch.deduction_2026);

    if (rows.length === 0) {
        rows.push(`<tr><td colspan="2">Нет оценочных вычетов на ${yearLabel} год в модели</td></tr>`);
    }

    rows.push(`<tr class="tax-breakdown-sub"><td colspan="2">Дополнительные вычеты</td></tr>`);
    rows.push(`<tr><td>Покупка квартиры</td><td>${escapeHtml(formatMoneyTax(0))}</td></tr>`);
    rows.push(`<tr><td>Проценты по ипотеке</td><td>${escapeHtml(formatMoneyTax(0))}</td></tr>`);
    rows.push(
        `<tr class="tax-breakdown-total"><td>Итого вычетов за год</td><td>${escapeHtml(formatMoneyTax(totals.deduction_2026))}</td></tr>`
    );

    return `<tbody data-finam-tax-year="1">\n${rows.join('\n')}\n</tbody>`;
}

function buildTaxTbodyPeriod(tax) {
    const pds = tax.pds_benefits || {};
    const iis = tax.iis_benefits || {};
    const nsj = tax.nsj_benefits || {};
    const ch = tax.children_benefits || {};
    const totals = tax.totals || {};

    const rows = [];
    const add = (label, v) => {
        if (toNum(v) <= 0) return;
        rows.push(`<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(formatMoneyTax(v))}</td></tr>`);
    };
    add('Вычет за ПДС', pds.total_deductions);
    add('Вычет за ИИС', iis.total_deductions);
    add('Вычет за НСЖ', nsj.total_deductions);
    add('Вычет на детей', ch.total_deductions);

    if (rows.length === 0) {
        rows.push(`<tr><td colspan="2">Нет накопленных вычетов за период в модели</td></tr>`);
    }

    rows.push(`<tr class="tax-breakdown-sub"><td colspan="2">Дополнительные вычеты</td></tr>`);
    rows.push(`<tr><td>Покупка квартиры</td><td>${escapeHtml(formatMoneyTax(0))}</td></tr>`);
    rows.push(`<tr><td>Проценты по ипотеке</td><td>${escapeHtml(formatMoneyTax(0))}</td></tr>`);
    rows.push(`<tr class="tax-breakdown-total"><td>Итого вычетов</td><td>${escapeHtml(formatMoneyTax(totals.total_deductions))}</td></tr>`);

    return `<tbody data-finam-tax-period="1">\n${rows.join('\n')}\n</tbody>`;
}

function applyFinamTaxPlanningPage(html, report) {
    if (!html || typeof html !== 'string') return html;
    const tax = report?.overall_plan?.tax_benefits || {};
    const yearLabel = new Date().getFullYear() + 1;

    let out = html.replace(/<tbody data-finam-tax-year="1">[\s\S]*?<\/tbody>/, buildTaxTbodyYear(tax, yearLabel));
    out = out.replace(/<tbody data-finam-tax-period="1">[\s\S]*?<\/tbody>/, buildTaxTbodyPeriod(tax));
    out = out.replace(
        /<div class="tax-plan-col-head">За 2026 год<\/div>/,
        `<div class="tax-plan-col-head">За ${yearLabel} год</div>`
    );
    out = out.replace(
        /<div class="doc-label">[^<]*<\/div>/,
        `<div class="doc-label">Налоговое планирование</div>`
    );
    return out;
}

module.exports = {
    orderFinamGoalsForPdf,
    applyFinamPage4TargetsFromReport,
    splitFinamPage4IntoStandalonePages,
    applyFinamPortfolioFinalPage,
    applyFinamTaxPlanningPage,
};
