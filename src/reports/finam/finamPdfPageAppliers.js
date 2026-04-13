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
        'goal-page-education-finam.html': 'goal-apartment.webp',
        'goal-page-apartment-finam.html': 'goal-apartment.webp',
        'goal-page-house-finam.html': 'goal-apartment.webp',
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
    if (type === 'INVESTMENT' || id === 3) return { cls: 'growth', label: 'Рост капитала' };
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
    if (facts.totalCapital > 0) commentParts.push(`целевой капитал ${formatMoneyValue(facts.totalCapital)}`);
    const commentText = commentParts.length > 0 ? commentParts.join(', ') : 'Параметры цели из расчёта финплана.';
    const commentInner = escapeHtml(commentText);

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
        const y = facts.retirementYear;
        tailHtml = `
      <div class="goal-formula">
        <div class="formula-block" style="flex:0.55;">
          <div class="formula-value">${escapeHtml(y ? String(y) : '—')}</div>
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
    const capitals = goals.map((g) => Math.max(0, computeGoalFacts(g).totalCapital));
    const monthlies = goals.map((g) => Math.max(0, computeGoalFacts(g).monthly));
    const sumC = capitals.reduce((a, b) => a + b, 0);
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

    const centerCap =
        sumC >= 1_000_000
            ? `${(sumC / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`
            : `${Math.round(sumC).toLocaleString('ru-RU')}`;
    const centerMonthly = `${Math.round(sumM).toLocaleString('ru-RU')}`;

    const legendCap = goals
        .map((g, i) => {
            const pct =
                sumC > 0 ? Math.round((capitals[i] / sumC) * 1000) / 10 : Math.round(1000 / goals.length) / 10;
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
        <div class="pie-title">Распределение целевого капитала</div>
        <div class="pie-wrapper">
          <div class="pie-circle" style="background: conic-gradient(${conicFromShares(capitals, sumC)});">
            <div class="pie-total">
              <div class="pie-total-value">${escapeHtml(centerCap)}</div>
              <div class="pie-total-label">₽</div>
            </div>
          </div>
          <div class="pie-legend">${legendCap}</div>
        </div>
      </div>
      <div class="pie-card">
        <div class="pie-title">Распределение пополнений</div>
        <div class="pie-wrapper">
          <div class="pie-circle" style="background: conic-gradient(${conicFromShares(monthlies, sumM)});">
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

function buildFinamPage4BodyInner(goals) {
    const n = goals.length;
    const introText = `У вас <em>${n}</em> ${goalsCountLabelRu(n)}. Ниже — краткий обзор по данным расчёта.`;

    const MAX_PAGE1 = 4;
    const chunk1 = goals.slice(0, Math.min(MAX_PAGE1, n));
    const chunk2 = n > MAX_PAGE1 ? goals.slice(MAX_PAGE1) : [];
    const totalPages = chunk2.length > 0 ? 2 : 1;

    let page1Sections = `
    <div class="avatar-section">
      <div class="avatar"><span class="avatar-text">ИИ</span></div>
      <div class="speech">
        <p>${introText}</p>
      </div>
    </div>`;

    chunk1.forEach((g, idx) => {
        const lastOnPage1 = idx === chunk1.length - 1;
        const showArrow = !(lastOnPage1 && chunk2.length === 0);
        page1Sections += buildGoalSectionHtml(g, { showArrowAfter: showArrow || chunk2.length > 0 });
    });

    if (chunk2.length > 0) {
        page1Sections += `
    <div class="page-break-indicator">
      <span>Продолжение на следующей странице</span>
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
    </div>`;
    }

    if (chunk2.length === 0) {
        page1Sections += buildSummaryPiesHtml(goals);
        return `<article class="page">
  <div class="content">
${page4Header(1, 1)}
${page1Sections}
${page4Footer()}
  </div>
</article>`;
    }

    const article1 = `<article class="page">
  <div class="content">
${page4Header(1, totalPages)}
${page1Sections}
  </div>
</article>`;

    let page2Sections = '';
    chunk2.forEach((g, idx) => {
        const isLast = idx === chunk2.length - 1;
        page2Sections += buildGoalSectionHtml(g, { showArrowAfter: !isLast });
    });
    page2Sections += buildSummaryPiesHtml(goals);

    const article2 = `<article class="page">
  <div class="content">
${page4Header(2, totalPages)}
${page2Sections}
${page4Footer()}
  </div>
</article>`;

    return `${article1}\n\n${article2}`;
}

function applyFinamPage4TargetsFromReport(html, orderedGoals) {
    if (!html || typeof html !== 'string') return html;
    const inner = buildFinamPage4BodyInner(orderedGoals);
    return html.replace(/<body>[\s\S]*<\/body>/i, `<body>\n${inner}\n</body>`);
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

function formatCompactRub(value) {
    const n = Math.round(toNum(value));
    if (Math.abs(n) >= 1_000_000) {
        const m = n / 1_000_000;
        return `${m.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} млн ₽`;
    }
    if (Math.abs(n) >= 1000) {
        return `${Math.round(n / 1000).toLocaleString('ru-RU')} тыс. ₽`;
    }
    return `${n.toLocaleString('ru-RU')} ₽`;
}

function buildHbarSegsInline(segments) {
    return segments
        .map((seg, i) => {
            const grow = Math.max(0.01, seg.pct);
            const [c1, c2] = DONUT_PALETTE[i % DONUT_PALETTE.length];
            const light = i % 3 === 2 ? ' hbar-seg--light' : '';
            return `<span class="hbar-seg${light}" style="flex-grow:${grow};background:linear-gradient(180deg,${c1} 0%,${c2} 100%)">${escapeHtml(String(Math.round(seg.pct * 10) / 10))}%</span>`;
        })
        .join('');
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
            <span class="donut-center-sum">${escapeHtml(formatCompactRub(totalInit))}</span>
            <span class="donut-center-pct">100%</span>
            <span class="donut-center-sub">уже в портфеле</span>
          </div>
        </div>
        <div class="total-legend">${legend}</div>
      </div>

      <p class="hbar-caption">Линейная шкала долей (та же разбивка, что и круг)</p>
      <div class="hbar" aria-hidden="true">${buildHbarSegsInline(segments)}</div>`;
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
            <span class="donut-center-sum">${escapeHtml(formatCompactRub(totalMo))}</span>
            <span class="donut-center-pct">100%</span>
            <span class="donut-center-sub">в месяц</span>
          </div>
        </div>
        <div class="total-legend">${legend}</div>
      </div>

      <p class="hbar-caption">Доли пополнений (круг = шкала)</p>
      <div class="hbar" aria-hidden="true">${buildHbarSegsInline(segments)}</div>`;
}

function buildPortfolioTableInitial(segments, totalInit) {
    const rows = segments
        .map(
            (s) => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td class="pct">${Math.round(s.pct * 10) / 10}%</td>
          <td class="num">${escapeHtml(Math.round(s.amount).toLocaleString('ru-RU'))}</td>
        </tr>`
        )
        .join('');
    return `
    <p class="pct-table-caption">Начальный капитал</p>
    <table class="pct-table" aria-label="Доли начального капитала по классам активов">
      <thead>
        <tr>
          <th>Класс актива</th>
          <th class="pct">Доля, %</th>
          <th class="num">Сумма, ₽</th>
        </tr>
      </thead>
      <tbody>
${rows}
        <tr class="total-row">
          <td>Итого</td>
          <td class="pct">100%</td>
          <td class="num">${escapeHtml(Math.round(totalInit).toLocaleString('ru-RU'))}</td>
        </tr>
      </tbody>
    </table>`;
}

function buildPortfolioTableContrib(segments, totalMo) {
    const rows = segments
        .map(
            (s) => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td class="pct">${Math.round(s.pct * 10) / 10}%</td>
          <td class="num">${escapeHtml(Math.round(s.amount).toLocaleString('ru-RU'))}</td>
        </tr>`
        )
        .join('');
    return `
    <p class="pct-table-caption">Портфель пополнений</p>
    <table class="pct-table" aria-label="Доли пополнений по инструментам">
      <thead>
        <tr>
          <th>Инструмент</th>
          <th class="pct">Доля, %</th>
          <th class="num">Сумма, ₽/мес</th>
        </tr>
      </thead>
      <tbody>
${rows}
        <tr class="total-row">
          <td>Итого взнос</td>
          <td class="pct">100%</td>
          <td class="num">${escapeHtml(Math.round(totalMo).toLocaleString('ru-RU'))}</td>
        </tr>
      </tbody>
    </table>`;
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
    if (iniInject) {
        out = out.replace(/<!-- @finam-portfolio-initial -->[\s\S]*?<!-- \/@finam-portfolio-initial -->/, iniInject);
        out = out.replace(
            /<!-- @finam-portfolio-table-initial -->[\s\S]*?<!-- \/@finam-portfolio-table-initial -->/,
            `<!-- @finam-portfolio-table-initial -->${buildPortfolioTableInitial(init.segments, totalInit)}<!-- /@finam-portfolio-table-initial -->`
        );
    }

    const cfInject = flow.segments.length > 0 && totalMo > 0 ? buildPortfolioContribInject(flow.segments, totalMo, uid) : null;
    if (cfInject) {
        out = out.replace(/<!-- @finam-portfolio-contrib -->[\s\S]*?<!-- \/@finam-portfolio-contrib -->/, cfInject);
        out = out.replace(
            /<!-- @finam-portfolio-table-contrib -->[\s\S]*?<!-- \/@finam-portfolio-table-contrib -->/,
            `<!-- @finam-portfolio-table-contrib -->${buildPortfolioTableContrib(flow.segments, totalMo)}<!-- /@finam-portfolio-table-contrib -->`
        );
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
    applyFinamPortfolioFinalPage,
    applyFinamTaxPlanningPage,
};
