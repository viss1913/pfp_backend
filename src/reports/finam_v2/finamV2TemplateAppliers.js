const fs = require('fs');
const path = require('path');
const { FINAM_REPORT_V2_PAGE_TYPES } = require('./finamReportV2Contract');

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

function maybeFinite(value) {
    if (value == null || value === '') return null;
    const normalized = typeof value === 'string'
        ? value.trim().replace(/\u00a0/g, '').replace(/\s+/g, '').replace(',', '.')
        : value;
    if (normalized === '') return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeCssColor(value, fallback) {
    const raw = String(value || '').trim();
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw) ? raw : fallback;
}

function replaceElementByDataAttr(html, attrName, attrValue, replacementHtml) {
    const source = String(html || '');
    const markerRe = new RegExp(`${escapeRegExp(attrName)}\\s*=\\s*["']${escapeRegExp(attrValue)}["']`, 'i');
    const markerMatch = markerRe.exec(source);
    if (!markerMatch) return source;

    const markerIdx = markerMatch.index;
    const openIdx = source.lastIndexOf('<', markerIdx);
    if (openIdx < 0 || source[openIdx + 1] === '/') return source;

    const tagMatch = source.slice(openIdx, openIdx + 80).match(/^<([a-zA-Z][\w:-]*)\b/);
    if (!tagMatch) return source;
    const tagName = tagMatch[1];
    const tagRe = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = openIdx;

    let depth = 0;
    let match;
    while ((match = tagRe.exec(source))) {
        const token = match[0];
        const isClosing = token.startsWith('</');
        const isSelfClosing = /\/\s*>$/.test(token);
        if (isClosing) {
            depth -= 1;
        } else if (!isSelfClosing) {
            depth += 1;
        }
        if (depth === 0) {
            return source.slice(0, openIdx) + replacementHtml + source.slice(tagRe.lastIndex);
        }
    }

    return source;
}

function replaceNthElementByClass(html, className, replacementHtml, occurrence = 1) {
    const source = String(html || '');
    const markerRe = /class\s*=\s*["']([^"']*)["']/gi;
    let markerMatch = null;
    for (let idx = 0; idx < occurrence; idx += 1) {
        do {
            markerMatch = markerRe.exec(source);
        } while (markerMatch && !String(markerMatch[1] || '').split(/\s+/).includes(className));
        if (!markerMatch) return source;
    }

    const markerIdx = markerMatch.index;
    const openIdx = source.lastIndexOf('<', markerIdx);
    if (openIdx < 0 || source[openIdx + 1] === '/') return source;

    const tagMatch = source.slice(openIdx, openIdx + 80).match(/^<([a-zA-Z][\w:-]*)\b/);
    if (!tagMatch) return source;
    const tagName = tagMatch[1];
    const tagRe = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = openIdx;

    let depth = 0;
    let match;
    while ((match = tagRe.exec(source))) {
        const token = match[0];
        const isClosing = token.startsWith('</');
        const isSelfClosing = /\/\s*>$/.test(token);
        if (isClosing) {
            depth -= 1;
        } else if (!isSelfClosing) {
            depth += 1;
        }
        if (depth === 0) {
            return source.slice(0, openIdx) + replacementHtml + source.slice(tagRe.lastIndex);
        }
    }

    return source;
}

function tagHasClass(tagHtml, className) {
    const match = String(tagHtml || '').match(/\bclass\s*=\s*["']([^"']*)["']/i);
    return match ? String(match[1] || '').split(/\s+/).includes(className) : false;
}

function matchingArticleEnd(source, openIdx) {
    const tagRe = /<\/?article\b[^>]*>/gi;
    tagRe.lastIndex = openIdx;
    let depth = 0;
    let match;
    while ((match = tagRe.exec(source))) {
        if (match[0].startsWith('</')) {
            depth -= 1;
        } else if (!/\/\s*>$/.test(match[0])) {
            depth += 1;
        }
        if (depth === 0) return tagRe.lastIndex;
    }
    return -1;
}

function replaceFinamV2PageArticles(html, replacer) {
    const source = String(html || '');
    const openRe = /<article\b[^>]*>/gi;
    let out = '';
    let cursor = 0;
    let index = 0;
    let match;
    while ((match = openRe.exec(source))) {
        if (!tagHasClass(match[0], 'finam-v2-page')) continue;
        const openIdx = match.index;
        const endIdx = matchingArticleEnd(source, openIdx);
        if (endIdx < 0) continue;
        out += source.slice(cursor, openIdx);
        out += replacer(source.slice(openIdx, endIdx), index);
        cursor = endIdx;
        index += 1;
        openRe.lastIndex = endIdx;
    }
    return index > 0 ? out + source.slice(cursor) : source;
}

function replaceFirstMatches(text, regex, replacements) {
    let idx = 0;
    return String(text || '').replace(regex, (match) => {
        if (idx >= replacements.length) return match;
        const replacement = replacements[idx];
        idx += 1;
        return typeof replacement === 'function' ? replacement(match, idx) : replacement;
    });
}

function formatPercentHtml(value, fallback = '—') {
    const n = maybeFinite(value);
    if (n == null) return escapeHtml(fallback);
    return escapeHtml(`${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`);
}

function formatMonthsLabel(months) {
    const n = Math.max(0, Math.round(finite(months, 0)));
    if (n <= 0) return 'срок не указан';
    return `${n} ${pluralRu(n, 'месяц', 'месяца', 'месяцев')}`;
}

function formatMonthsShortLabel(months) {
    const n = Math.max(0, Math.round(finite(months, 0)));
    return n > 0 ? `${n} мес` : 'срок не указан';
}

function productTypeLabel(productTypeRaw, fallback = 'Инструмент') {
    const type = String(productTypeRaw || '').trim().toUpperCase();
    if (!type) return fallback;
    const labels = {
        DEPOSIT: 'Вклад',
        SAVINGS: 'Накопительный счёт',
        SAVINGS_ACCOUNT: 'Накопительный счёт',
        LIFE: 'Страхование жизни',
        LIFE_INSURANCE: 'Страхование жизни',
        NSZH: 'Страхование жизни',
        ILI: 'Страхование жизни',
        INSURANCE: 'Страхование',
        BOND: 'Облигации',
        STOCK: 'Акции',
        ETF: 'ETF',
        PDS: 'ПДС',
    };
    return labels[type] || labelFromMap(type, {}, fallback);
}

function pickFirstInstrument(goal) {
    const details = goal?.details || {};
    const initial = Array.isArray(details.initial_instruments) ? details.initial_instruments : [];
    const monthly = Array.isArray(details.monthly_instruments) ? details.monthly_instruments : [];
    const first = initial[0] || monthly[0] || {};
    const monthlyFirst = monthly[0] || {};
    return {
        name: first?.name || monthlyFirst?.name || '',
        productType: first?.product_type || first?.type || monthlyFirst?.product_type || monthlyFirst?.type || '',
        share: maybeFinite(first?.share ?? first?.value ?? monthlyFirst?.share ?? monthlyFirst?.value),
        yieldPercent: maybeFinite(first?.short_term_yield ?? first?.yield ?? monthlyFirst?.short_term_yield ?? monthlyFirst?.yield),
        initialAmount: maybeFinite(first?.amount),
        monthlyAmount: maybeFinite(monthlyFirst?.amount),
        provider: first?.provider_name || first?.company_name || monthlyFirst?.provider_name || monthlyFirst?.company_name || '',
    };
}

function goalMonthsValue(goal) {
    return finite(goal?.summary?.target_months ?? goal?.summary?.term_months ?? goal?.details?.term_months ?? goal?.term_months, 0);
}

function normalizeFinReserveGoal(goal, helpers) {
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    const instrument = pickFirstInstrument(goal);
    const months = goalMonthsValue(goal);
    const initial = finite(instrument.initialAmount ?? summary.initial_capital ?? details.initial_capital ?? goal?.initial_capital, 0);
    const monthly = finite(instrument.monthlyAmount ?? summary.monthly_replenishment ?? details.monthly_replenishment ?? goal?.monthly_replenishment, 0);
    const finalRaw =
        summary.projected_capital_at_end ??
        summary.target_amount_future ??
        summary.total_capital_at_end ??
        summary.target_amount_initial ??
        goal?.target_amount;
    const fallbackFinal = initial + monthly * Math.max(0, Math.round(months));
    const final = finite(finalRaw, fallbackFinal || initial);
    const yieldPercent = maybeFinite(instrument.yieldPercent ?? summary.accumulation_yield_percent ?? summary.portfolio_yield_percent ?? goal?.pdf_metrics?.portfolio_yield_percent);
    const share = maybeFinite(instrument.share);
    const title = goalName(goal, helpers);

    return {
        title,
        months,
        initial,
        monthly,
        final,
        yieldPercent,
        instrumentName: instrument.name || 'Банковский накопительный счёт',
        instrumentType: productTypeLabel(instrument.productType, 'Инструмент'),
        shareLabel: share != null && share > 0 ? `${Math.round(share).toLocaleString('ru-RU')}%` : '100%',
    };
}

function normalizeDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function toMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

const MONTH_SHORT_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTH_LONG_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function formatChartMonthShortRu(date) {
    const d = normalizeDate(date);
    return d ? MONTH_SHORT_RU[d.getMonth()] : '—';
}

function formatChartMonthLongRu(date) {
    const d = normalizeDate(date);
    return d ? `${MONTH_LONG_RU[d.getMonth()]} ${d.getFullYear()}` : '—';
}

function formatAxisMoney(value) {
    return Math.round(finite(value, 0)).toLocaleString('ru-RU');
}

function normalizeReserveChartPoints(goal, reserve) {
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const byMonth = new Map();
    rows.forEach((row) => {
        const date = normalizeDate(row?.date);
        const total = maybeFinite(row?.total_capital ?? row?.capital ?? row?.balance);
        if (!date || total == null || total < 0) return;
        byMonth.set(toMonthKey(date), { date: new Date(date.getFullYear(), date.getMonth(), 1), total });
    });
    const points = [...byMonth.values()].sort((a, b) => a.date - b.date);
    if (points.length > 1) return points;

    const months = Math.max(1, Math.round(finite(reserve.months, 12)));
    const start = points[0]?.date || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const generated = [];
    for (let i = 0; i <= months; i += 1) {
        const t = months > 0 ? i / months : 1;
        generated.push({
            date: addMonths(start, i),
            total: reserve.initial + (reserve.final - reserve.initial) * t,
        });
    }
    return generated;
}

function sampleIndexes(length, maxCount) {
    if (length <= 0) return [];
    const count = Math.min(maxCount, length);
    const indexes = new Set();
    for (let i = 0; i < count; i += 1) {
        indexes.add(Math.round((i * (length - 1)) / Math.max(1, count - 1)));
    }
    return [...indexes].sort((a, b) => a - b);
}

function buildFinamV2ReserveChartSvg(goal, reserve) {
    const points = normalizeReserveChartPoints(goal, reserve);
    if (!points.length) return '';

    const xStart = 46;
    const xEnd = 486;
    const yTop = 28;
    const yBottom = 148;
    const width = xEnd - xStart;
    const height = yBottom - yTop;
    const values = points.map((point) => finite(point.total, 0));
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const spread = Math.max(maxValue - minValue, Math.max(maxValue, 1) * 0.08);
    const low = Math.max(0, minValue - spread * 0.2);
    const high = maxValue + spread * 0.2;
    const range = Math.max(1, high - low);
    const toX = (idx) => (points.length === 1 ? xStart : xStart + (idx / (points.length - 1)) * width);
    const toY = (value) => yBottom - ((value - low) / range) * height;
    const chartPoints = points.map((point, idx) => ({
        x: toX(idx),
        y: toY(point.total),
        value: point.total,
        date: point.date,
    }));
    const polyline = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const areaPath = `M${polyline.replace(/\s+/g, ' L')} L${xEnd},${yBottom} L${xStart},${yBottom} Z`;
    const yTicks = Array.from({ length: 6 }, (_, idx) => {
        const t = idx / 5;
        const y = yBottom - t * height;
        const value = low + t * range;
        return {
            y,
            value,
        };
    });
    const xLabelIndexes = sampleIndexes(chartPoints.length, chartPoints.length <= 12 ? 12 : 6);
    const circleIndexes = sampleIndexes(chartPoints.length, Math.min(13, chartPoints.length));

    return `<svg data-finam-v2-block="reserve-chart-svg" viewBox="0 0 500 188" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="finamV2ReserveChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1e6bb8" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="#1e6bb8" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        ${yTicks.map((tick) => `<line x1="${xStart}" y1="${tick.y.toFixed(1)}" x2="${xEnd}" y2="${tick.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`).join('\n        ')}

        <line x1="${xStart}" y1="${yTop}" x2="${xStart}" y2="${yBottom}" stroke="#cbd5e1" stroke-width="1"/>
        <line x1="${xStart}" y1="${yBottom}" x2="${xEnd}" y2="${yBottom}" stroke="#cbd5e1" stroke-width="1"/>

        ${yTicks.map((tick) => `<text x="40" y="${(tick.y + 3).toFixed(1)}" font-size="8" fill="#64748b" text-anchor="end">${escapeHtml(formatAxisMoney(tick.value))}</text>`).join('\n        ')}

        <path d="${areaPath}" fill="url(#finamV2ReserveChartGrad)"/>
        <polyline points="${polyline}" fill="none" stroke="#1e6bb8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

        <g fill="#fff" stroke="#1e6bb8" stroke-width="1.6">
          ${circleIndexes.map((idx) => {
        const point = chartPoints[idx];
        return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3"/>`;
    }).join('\n          ')}
        </g>

        ${xLabelIndexes.map((idx) => {
        const point = chartPoints[idx];
        return `<text x="${point.x.toFixed(1)}" y="168" font-size="8" fill="#64748b" text-anchor="middle">${escapeHtml(formatChartMonthShortRu(point.date))}</text>`;
    }).join('\n        ')}
        <text x="${xStart}" y="180" font-size="8" fill="#64748b" text-anchor="middle">${chartPoints[0].date.getFullYear()}</text>
        <text x="${xEnd}" y="180" font-size="8" fill="#64748b" text-anchor="middle">${chartPoints[chartPoints.length - 1].date.getFullYear()}</text>
      </svg>`;
}

function reserveInstrumentRow(field, label, valueHtml) {
    return `<div class="finam-v2-reserve__instrument-row" data-finam-v2-field="${field}"><span>${escapeHtml(label)}</span><span>${valueHtml}</span></div>`;
}

function replaceFinReserveGoalPage(html, context) {
    const { goal, helpers } = context;
    if (!goal) return html;
    const reserve = normalizeFinReserveGoal(goal, helpers);
    const points = normalizeReserveChartPoints(goal, reserve);
    const firstDate = points[0]?.date;
    const lastDate = points[points.length - 1]?.date;
    const displayFinal = finite(points[points.length - 1]?.total, reserve.final);
    const yieldHtml = formatPercentHtml(reserve.yieldPercent);
    const titleHtml = escapeHtml(reserve.title);
    const initialHtml = moneyHtml(helpers, reserve.initial);
    const monthlyHtml = moneyHtml(helpers, reserve.monthly);
    const monthlyPerMonthHtml = moneyHtml(helpers, reserve.monthly, { perMonth: true });
    const finalHtml = moneyHtml(helpers, displayFinal);
    const monthsLabel = formatMonthsLabel(reserve.months);
    const monthsShortLabel = formatMonthsShortLabel(reserve.months);
    const chartTitle = firstDate && lastDate
        ? `Рост капитала: ${formatChartMonthLongRu(firstDate)} — ${formatChartMonthLongRu(lastDate)}`
        : `Рост капитала: ${monthsLabel}`;

    let out = String(html || '');
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-ai-intro', `<div class="finam-v2-reserve__bubble" data-finam-v2-field="reserve-ai-intro">
        <p>Разбираем цель — <strong>${titleHtml}</strong>. Начальный капитал <strong>${initialHtml}</strong>, плановое пополнение <strong>${monthlyPerMonthHtml}</strong>; динамику ниже строим по фактическому графику цели.</p>
      </div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-page-title', `<h1 class="finam-v2-reserve__page-title" data-finam-v2-field="reserve-page-title">Цель - ${titleHtml}</h1>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-subtitle', `<p class="finam-v2-reserve__subtitle" data-finam-v2-field="reserve-subtitle">Подушка безопасности, срок формирования — ${escapeHtml(monthsLabel)}.</p>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-desc', `<p class="finam-v2-reserve__desc" data-finam-v2-field="reserve-desc">
          Начальный капитал <strong>${initialHtml}</strong> уже на месте. Пополнение
          <strong>${monthlyPerMonthHtml}</strong> в инструменте «${escapeHtml(reserve.instrumentName)}» с доходностью <strong>${yieldHtml}</strong> доведёт капитал до
          <strong>${finalHtml}</strong> за ${escapeHtml(monthsLabel)}.
        </p>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-initial', `<div class="finam-v2-reserve__metric-value" data-finam-v2-field="reserve-initial">${initialHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-monthly', `<div class="finam-v2-reserve__metric-value" data-finam-v2-field="reserve-monthly">${monthlyPerMonthHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-final', `<div class="finam-v2-reserve__metric-value" data-finam-v2-field="reserve-final">${finalHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-final-label', `<div class="finam-v2-reserve__metric-label" data-finam-v2-field="reserve-final-label">Итог через ${escapeHtml(monthsShortLabel)}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-instrument-name', `<div class="finam-v2-reserve__instrument-name" data-finam-v2-field="reserve-instrument-name">${escapeHtml(reserve.instrumentName)}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-instrument-type', reserveInstrumentRow('reserve-instrument-type', 'Тип', escapeHtml(reserve.instrumentType)));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-instrument-share', reserveInstrumentRow('reserve-instrument-share', 'Доля', escapeHtml(reserve.shareLabel)));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-instrument-initial', reserveInstrumentRow('reserve-instrument-initial', 'Начальная сумма', initialHtml));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-instrument-monthly', reserveInstrumentRow('reserve-instrument-monthly', 'Ежемесячное пополнение', monthlyHtml));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-yield', `<div class="finam-v2-reserve__rate-value" data-finam-v2-field="reserve-yield">${yieldHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-chart-title', `<div class="finam-v2-reserve__chart-title" data-finam-v2-field="reserve-chart-title">${escapeHtml(chartTitle)}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'reserve-chart-total', `<div class="finam-v2-reserve__chart-total" data-finam-v2-field="reserve-chart-total">${finalHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-block', 'reserve-chart-svg', buildFinamV2ReserveChartSvg(goal, reserve));
    return out;
}

function compactLifeRiskName(value) {
    const name = String(value || 'Риск').trim() || 'Риск';
    return name
        .replace(/Инвалидность I и II группа/i, 'Инвалидность I-II гр.')
        .replace(/в результате дорожно-транспортного происшествия/i, 'ДТП')
        .replace(/в результате несчастного случая/i, 'НС');
}

function normalizeLifeRisks(goal) {
    const details = goal?.details || {};
    const summary = goal?.summary || {};
    const source = Array.isArray(details.risks) ? details.risks : [];
    const risks = source
        .map((risk) => ({
            name: compactLifeRiskName(risk?.risk_name || risk?.name),
            amount: maybeFinite(risk?.limit_amount ?? risk?.amount ?? risk?.coverage),
        }))
        .filter((risk) => risk.amount != null && risk.amount > 0)
        .slice(0, 5);
    if (risks.length) return risks;
    const coverage = maybeFinite(summary.target_coverage ?? summary.target_amount_initial ?? goal?.target_amount);
    return coverage != null && coverage > 0 ? [{ name: 'Страховое покрытие', amount: coverage }] : [];
}

function scheduleTaxSummary(goal) {
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const taxRows = rows
        .map((row) => ({ date: normalizeDate(row?.date), amount: finite(row?.tax_deduction, 0) }))
        .filter((row) => row.date && row.amount > 0)
        .sort((a, b) => a.date - b.date);
    const total = taxRows.reduce((sum, row) => sum + row.amount, 0);
    const firstYear = taxRows[0]?.date.getFullYear() || new Date().getFullYear();
    const yearAmount = taxRows
        .filter((row) => row.date.getFullYear() === firstYear)
        .reduce((sum, row) => sum + row.amount, 0);
    return {
        total,
        year: firstYear,
        yearAmount,
    };
}

function premiumFrequencyLabel(value, monthlyPremium) {
    const raw = String(value || '').trim().toLowerCase();
    const labels = {
        monthly: 'Ежемесячно',
        month: 'Ежемесячно',
        ежегодно: 'Ежегодно',
        yearly: 'Ежегодно',
        annual: 'Ежегодно',
        once: 'Единовременно',
        single: 'Единовременно',
    };
    if (labels[raw]) return labels[raw];
    if (raw) return labelFromMap(raw, {}, raw);
    return monthlyPremium > 0 ? 'Ежемесячно' : 'По графику';
}

function normalizeLifeGoal(goal, helpers) {
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    const instrument = pickFirstInstrument(goal);
    const risks = normalizeLifeRisks(goal);
    const coverage = Math.max(0, ...risks.map((risk) => finite(risk.amount, 0)), finite(summary.target_coverage ?? summary.target_amount_initial ?? goal?.target_amount, 0));
    const monthlyFromData = maybeFinite(summary.monthly_replenishment ?? details.monthly_premium ?? details.monthly_replenishment ?? goal?.monthly_replenishment ?? instrument.monthlyAmount);
    let annualPremium = maybeFinite(details.annual_premium ?? summary.annual_premium ?? details.premium_annual ?? summary.initial_capital ?? details.initial_capital ?? instrument.initialAmount);
    let monthlyPremium = monthlyFromData;
    if (annualPremium == null && monthlyPremium != null) annualPremium = monthlyPremium * 12;
    if (monthlyPremium == null && annualPremium != null) monthlyPremium = annualPremium / 12;
    annualPremium = finite(annualPremium, 0);
    monthlyPremium = finite(monthlyPremium, 0);

    const scheduleTax = scheduleTaxSummary(goal);
    const specificTax2026 = maybeFinite(summary.tax_deduction_2026 ?? details.tax_deduction_2026);
    const explicitYearTax = specificTax2026 ?? maybeFinite(summary.tax_year_amount ?? details.tax_year_amount);
    const explicitTotalTax = maybeFinite(summary.total_tax_benefit ?? summary.total_tax_deductions ?? details.total_tax_deductions ?? details.total_tax_refund);
    const explicitTaxYear = maybeFinite(summary.tax_year ?? details.tax_year ?? summary.tax_deduction_year ?? details.tax_deduction_year);
    const taxYear = explicitTaxYear ? Math.round(explicitTaxYear) : (specificTax2026 != null ? 2026 : scheduleTax.year);
    const taxYearAmount = explicitYearTax ?? scheduleTax.yearAmount;
    const totalTax = explicitTotalTax ?? scheduleTax.total;
    const explicitTariff = maybeFinite(
        details.tariff_percent ??
        details.annual_tariff_percent ??
        details.rate_percent ??
        summary.tariff_percent ??
        summary.annual_tariff_percent
    );
    const tariff = explicitTariff ?? (coverage > 0 && annualPremium > 0 ? (annualPremium / coverage) * 100 : null);
    const programName = details.program_name || instrument.name || goalName(goal, helpers);
    const provider = details.company_name || details.insurer_name || details.provider_name || instrument.provider || '';
    const share = maybeFinite(instrument.share);

    return {
        title: goalName(goal, helpers),
        programName,
        provider,
        risks,
        coverage,
        annualPremium,
        monthlyPremium,
        tariff,
        taxYear,
        taxYearAmount: finite(taxYearAmount, 0),
        totalTax: finite(totalTax, 0),
        frequencyLabel: premiumFrequencyLabel(summary.premium_frequency ?? details.premium_frequency, monthlyPremium),
        productType: productTypeLabel(instrument.productType, 'Страхование жизни'),
        shareLabel: share != null && share > 0 ? `${Math.round(share).toLocaleString('ru-RU')}%` : '100%',
    };
}

function lifeProductRow(field, label, valueHtml) {
    return `<div class="finam-v2-life__product-row" data-finam-v2-field="${field}"><span>${escapeHtml(label)}</span><span>${valueHtml}</span></div>`;
}

function lifeRiskIconSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l7 4v5c0 5-3 9-7 11-4-2-7-6-7-11V7l7-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>`;
}

function buildLifeRiskGridHtml(life, helpers) {
    const risks = life.risks.length ? life.risks : [{ name: 'Покрытие уточняется', amount: life.coverage }];
    return `<div class="finam-v2-life__risk-grid" data-finam-v2-block="life-risk-grid">
      ${risks.slice(0, 5).map((risk) => `<div class="finam-v2-life__risk">
        ${lifeRiskIconSvg()}
        <div class="finam-v2-life__risk-name">${escapeHtml(risk.name)}</div>
        <div class="finam-v2-life__risk-value">${moneyHtml(helpers, risk.amount, { short: true })}</div>
      </div>`).join('\n      ')}
    </div>`;
}

function replaceLifeGoalPage(html, context) {
    const { goal, helpers } = context;
    if (!goal) return html;
    const life = normalizeLifeGoal(goal, helpers);
    const titleHtml = escapeHtml(life.title);
    const annualHtml = moneyHtml(helpers, life.annualPremium);
    const monthlyHtml = moneyHtml(helpers, life.monthlyPremium);
    const riskCount = life.risks.length;
    const riskWord = pluralRu(riskCount, 'риск', 'риска', 'рисков');
    const providerSuffix = life.provider ? ` · ${escapeHtml(life.provider)}` : '';
    const tariffHtml = formatPercentHtml(life.tariff);
    const totalTaxHtml = moneyHtml(helpers, life.totalTax);
    const yearTaxHtml = moneyHtml(helpers, life.taxYearAmount);
    const maxCoverageHtml = moneyHtml(helpers, life.coverage, { short: true });

    let out = String(html || '');
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-page-title', `<h1 class="finam-v2-life__page-title" data-finam-v2-field="life-page-title">Цель - ${titleHtml}</h1>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-ai-intro', `<div class="finam-v2-life__bubble" data-finam-v2-field="life-ai-intro">
        <p>Цель <strong>«${titleHtml}»</strong> закрывает семейный downside: ${riskCount || 'ключевые'} ${riskCount ? riskWord : 'риски'} переведены в лимиты выплат, максимальное покрытие — <strong>${maxCoverageHtml}</strong>.</p>
      </div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-kicker', `<div class="finam-v2-life__kicker" data-finam-v2-field="life-kicker">Life${providerSuffix}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-subtitle', `<p class="finam-v2-life__subtitle" data-finam-v2-field="life-subtitle">
          Программа «${escapeHtml(life.programName)}» с фактическим покрытием рисков и регулярным взносом по расчёту клиента.
        </p>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-line', `<p class="finam-v2-life__product-line" data-finam-v2-field="life-product-line">
          Продукт: <strong>${escapeHtml(life.programName)}</strong>
        </p>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-risk-kicker', `<p class="finam-v2-life__section-kicker" data-finam-v2-field="life-risk-kicker">${riskCount || 'Ключевые'} ${riskCount ? riskWord : 'риски'} закрыты лимитами</p>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-block', 'life-risk-grid', buildLifeRiskGridHtml(life, helpers));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-annual-premium', `<div class="finam-v2-life__kpi-value" data-finam-v2-field="life-annual-premium">${annualHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-monthly-premium', `<div class="finam-v2-life__kpi-value" data-finam-v2-field="life-monthly-premium">${monthlyHtml}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-name', `<div class="finam-v2-life__product-name" data-finam-v2-field="life-product-name">${escapeHtml(life.programName)}</div>`);
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-type', lifeProductRow('life-product-type', 'Тип продукта', escapeHtml(life.productType)));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-share', lifeProductRow('life-product-share', 'Доля в цели', escapeHtml(life.shareLabel)));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-annual', lifeProductRow('life-product-annual', 'Взнос в год', annualHtml));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-monthly', lifeProductRow('life-product-monthly', 'Ежемесячный взнос', monthlyHtml));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-product-frequency', lifeProductRow('life-product-frequency', 'Периодичность', escapeHtml(life.frequencyLabel)));
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-tariff', `<div class="finam-v2-life__rate-value" data-finam-v2-field="life-tariff">${tariffHtml}</div>`);
    if (life.totalTax <= 0 && life.taxYearAmount <= 0) {
        out = out.replace(/\s*<section class="finam-v2-life__tax">[\s\S]*?<\/section>/, '');
    } else {
        out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-tax-text', `<p class="finam-v2-life__tax-text" data-finam-v2-field="life-tax-text">
          По модели плана: суммарный вычет <strong>${totalTaxHtml}</strong>; оценка на ${escapeHtml(life.taxYear)} год —
          <strong>${yearTaxHtml}</strong>.
        </p>`);
        out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-tax-total', `<div class="finam-v2-life__tax-value" data-finam-v2-field="life-tax-total">${totalTaxHtml}</div>`);
        out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-tax-year', `<div class="finam-v2-life__tax-value" data-finam-v2-field="life-tax-year">+${yearTaxHtml}</div>`);
        out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-tax-year-label', `<div class="finam-v2-life__tax-label" data-finam-v2-field="life-tax-year-label">в ${escapeHtml(life.taxYear)}</div>`);
    }
    out = replaceElementByDataAttr(out, 'data-finam-v2-field', 'life-ai-conclusion', `<div class="finam-v2-life__comment" data-finam-v2-field="life-ai-conclusion">
        <p>
          <strong>Ключевой вывод:</strong> защита структурирована через программу «${escapeHtml(life.programName)}». Следующий шаг — раз в год сверять лимиты с доходом, обязательствами семьи и фактической стоимостью защиты.
        </p>
      </div>`);
    return out;
}

function yearsLabelFromMonths(months) {
    const m = Math.max(0, Math.round(finite(months, 0)));
    if (m <= 0) return 'срок не указан';
    const years = Math.max(1, Math.round(m / 12));
    return `${years} ${pluralRu(years, 'год', 'года', 'лет')}`;
}

function firstScheduleYear(goal) {
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const dates = rows.map((row) => normalizeDate(row?.date)).filter(Boolean).sort((a, b) => a - b);
    return dates[0]?.getFullYear() || new Date().getFullYear();
}

function targetYearFromGoal(goal, months = goalMonthsValue(goal)) {
    const stateYear = maybeFinite(goal?.details?.state_pension?.retirement_year);
    if (stateYear && stateYear > 1900) return Math.round(stateYear);
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const dates = rows.map((row) => normalizeDate(row?.date)).filter(Boolean).sort((a, b) => a - b);
    if (dates.length) return dates[dates.length - 1].getFullYear();
    return addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), Math.max(0, Math.round(finite(months, 0)))).getFullYear();
}

function formatNumberRu(value, digits = 1) {
    const n = maybeFinite(value);
    if (n == null) return '—';
    return n.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

function formatShortMoneyNoCurrency(helpers, value) {
    return formatMoneyWith(helpers, value, { short: true }).replace(/\s*₽$/, '');
}

function goalCapitalValue(goal) {
    const s = goal?.summary || {};
    return finite(
        s.projected_capital_at_retirement ??
        s.required_capital_at_retirement ??
        s.projected_capital_at_end ??
        s.target_amount_future ??
        s.total_capital_at_end ??
        goal?.target_amount,
        0
    );
}

function scheduleYearAmount(goal, fieldName) {
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const items = rows
        .map((row) => ({ date: normalizeDate(row?.date), amount: finite(row?.[fieldName], 0) }))
        .filter((row) => row.date && row.amount > 0)
        .sort((a, b) => a.date - b.date);
    const year = items[0]?.date.getFullYear() || firstScheduleYear(goal);
    const amount = items
        .filter((row) => row.date.getFullYear() === year)
        .reduce((sum, row) => sum + row.amount, 0);
    return { year, amount };
}

function capitalComposition({ initial, monthly, months, total, cofin = 0 }) {
    const own = Math.max(0, finite(initial, 0) + finite(monthly, 0) * Math.max(0, Math.round(finite(months, 0))));
    const extra = Math.max(0, finite(total, 0) - own);
    // Tax refunds are displayed as benefits, but only cofinancing is included in projected capital.
    const investment = Math.max(0, extra - finite(cofin, 0));
    return {
        own,
        replenishments: Math.max(0, finite(monthly, 0) * Math.max(0, Math.round(finite(months, 0)))),
        investment,
        extra,
        total: Math.max(finite(total, 0), own + extra),
    };
}

function barPct(value, total) {
    const totalValue = Math.max(1, finite(total, 0));
    return Math.max(0, Math.min(100, (finite(value, 0) / totalValue) * 100));
}

function buildGoalBarsHtml(prefix, rows) {
    return `<section class="finam-v2-${prefix}__bars">
      ${rows.map((row) => `<div class="finam-v2-${prefix}__bar-row">
        <span>${escapeHtml(row.label)}</span>
        <div class="finam-v2-${prefix}__bar-track">
          <div class="finam-v2-${prefix}__bar-fill" style="width: ${finite(row.percent, 0).toFixed(1)}%; background: ${escapeHtml(row.color)};"></div>
        </div>
        <span class="finam-v2-${prefix}__bar-val">${row.valueHtml}</span>
        <span class="finam-v2-${prefix}__bar-pct">${finite(row.percent, 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</span>
      </div>`).join('\n      ')}
    </section>`;
}

function buildGoalCapitalChartSvg({ goal, initial, final, months, blockName, gradientId, height = 210 }) {
    const points = normalizeReserveChartPoints(goal, { initial, final, months });
    const xStart = 44;
    const xEnd = 486;
    const yTop = 20;
    const yBottom = Math.max(92, height - 38);
    const xLabelY = Math.max(yBottom + 16, height - 17);
    const width = xEnd - xStart;
    const chartHeight = yBottom - yTop;
    const values = points.map((point) => finite(point.total, 0));
    const maxValue = Math.max(1, ...values);
    const low = 0;
    const high = maxValue * 1.08;
    const range = Math.max(1, high - low);
    const toX = (idx) => (points.length === 1 ? xStart : xStart + (idx / (points.length - 1)) * width);
    const toY = (value) => yBottom - ((value - low) / range) * chartHeight;
    const chartPoints = points.map((point, idx) => ({
        x: toX(idx),
        y: toY(point.total),
        value: point.total,
        date: point.date,
    }));
    const polyline = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const areaPath = `M${polyline.replace(/\s+/g, ' L')} L${xEnd},${yBottom} L${xStart},${yBottom} Z`;
    const yTicks = Array.from({ length: 5 }, (_, idx) => {
        const t = idx / 4;
        return {
            y: yBottom - t * chartHeight,
            value: low + t * range,
        };
    });
    const xLabelIndexes = sampleIndexes(chartPoints.length, Math.min(6, chartPoints.length));
    const circleIndexes = sampleIndexes(chartPoints.length, Math.min(6, chartPoints.length));

    return `<svg data-finam-v2-block="${escapeHtml(blockName)}" viewBox="0 0 500 ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="${escapeHtml(gradientId)}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1e6bb8" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#1e6bb8" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        ${yTicks.map((tick) => `<line x1="${xStart}" y1="${tick.y.toFixed(1)}" x2="${xEnd}" y2="${tick.y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`).join('\n        ')}
        <line x1="${xStart}" y1="${yTop}" x2="${xStart}" y2="${yBottom}" stroke="#cbd5e1" stroke-width="1"/>
        <line x1="${xStart}" y1="${yBottom}" x2="${xEnd}" y2="${yBottom}" stroke="#cbd5e1" stroke-width="1"/>
        ${yTicks.map((tick) => `<text x="38" y="${(tick.y + 3).toFixed(1)}" font-size="8" fill="#64748b" text-anchor="end">${escapeHtml(formatShortMoneyNoCurrency({}, tick.value))}</text>`).join('\n        ')}
        <path d="${areaPath}" fill="url(#${escapeHtml(gradientId)})"/>
        <polyline points="${polyline}" fill="none" stroke="#1e6bb8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <g fill="#fff" stroke="#1e6bb8" stroke-width="1.6">
          ${circleIndexes.map((idx) => {
        const point = chartPoints[idx];
        return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3"/>`;
    }).join('\n          ')}
        </g>
        ${xLabelIndexes.map((idx) => {
        const point = chartPoints[idx];
        return `<text x="${point.x.toFixed(1)}" y="${xLabelY}" font-size="8" fill="#64748b" text-anchor="middle">${point.date.getFullYear()}</text>`;
    }).join('\n        ')}
      </svg>`;
}

function normalizePensionGoal(goal, helpers) {
    const s = goal?.summary || {};
    const d = goal?.details || {};
    const state = d.state_pension || {};
    const instrument = pickFirstInstrument(goal);
    const months = goalMonthsValue(goal);
    const years = Math.max(1, Math.round(months / 12));
    const initial = finite(s.initial_capital ?? d.initial_capital ?? instrument.initialAmount, 0);
    const monthly = finite(s.monthly_replenishment ?? d.monthly_replenishment ?? instrument.monthlyAmount, 0);
    const capital = goalCapitalValue(goal);
    const targetPresent = finite(s.projected_pension_monthly_present ?? s.target_amount_initial, 0);
    const targetFuture = finite(s.projected_pension_monthly_future ?? s.target_amount_future, 0);
    const stateToday = finite(s.state_pension_monthly_today ?? state.state_pension_monthly_today, 0);
    const stateFuture = finite(s.state_pension_monthly_future ?? state.state_pension_monthly_future, 0);
    const gapToday = finite(s.pension_gap_today, Math.max(0, targetPresent - stateToday));
    const gapFuture = finite(s.pension_gap_future, Math.max(0, targetFuture - stateFuture));
    const taxYear = scheduleYearAmount(goal, 'tax_deduction');
    const cofinYear = scheduleYearAmount(goal, 'cofinancing');
    const totalTax = finite(s.total_tax_benefit ?? s.total_tax_deductions ?? d.total_tax_deductions, taxYear.amount);
    const totalCofin = finite(s.total_cofinancing ?? d.total_cofinancing ?? d.total_cofinancing_nominal, cofinYear.amount);
    const composition = capitalComposition({ initial, monthly, months, total: capital, tax: totalTax, cofin: totalCofin });
    const payoutYield = finite(s.payout_yield_percent, 8);

    return {
        title: goalName(goal, helpers),
        provider: instrument.provider || '',
        retirementYear: targetYearFromGoal(goal, months),
        years,
        months,
        initial,
        monthly,
        capital,
        targetPresent,
        targetFuture,
        stateToday,
        stateFuture,
        gapToday,
        gapFuture,
        inflation: maybeFinite(s.inflation_rate),
        accumulationYield: maybeFinite(s.accumulation_yield_percent ?? instrument.yieldPercent),
        payoutYield,
        instrumentName: instrument.name || 'Пенсионный инструмент',
        instrumentType: productTypeLabel(instrument.productType, 'Инструмент'),
        shareLabel: instrument.share != null && instrument.share > 0 ? `${Math.round(instrument.share).toLocaleString('ru-RU')}%` : '100%',
        totalTax,
        totalCofin,
        taxYear,
        cofinYear,
        composition,
        statePension: {
            ipkTotal: maybeFinite(state.ipk_total ?? state.ipk_forecast ?? s.ipk_current),
            ipkCurrent: maybeFinite(state.ipk_current ?? s.ipk_current),
            pointCostToday: maybeFinite(state.point_cost_today),
            fixedPaymentToday: maybeFinite(state.fixed_payment_today),
        },
    };
}

function pensionRow(label, valueHtml) {
    return `<div class="finam-v2-pension__row"><span>${escapeHtml(label)}</span><span>${valueHtml}</span></div>`;
}

function replacePensionGoalPage(html, context) {
    const { goal, helpers } = context;
    if (!goal) return html;
    const p = normalizePensionGoal(goal, helpers);
    const title = escapeHtml(p.title);
    const capitalHtml = moneyHtml(helpers, p.capital, { short: true });
    const capitalShort = escapeHtml(formatShortMoneyNoCurrency(helpers, p.capital));
    const targetFutureHtml = moneyHtml(helpers, p.targetFuture, { perMonth: true });
    const targetPresentHtml = moneyHtml(helpers, p.targetPresent, { perMonth: true });
    const stateTodayHtml = moneyHtml(helpers, p.stateToday, { perMonth: true });
    const stateFutureHtml = moneyHtml(helpers, p.stateFuture, { perMonth: true });
    const gapTodayHtml = moneyHtml(helpers, p.gapToday, { perMonth: true });
    const gapFutureHtml = moneyHtml(helpers, p.gapFuture, { perMonth: true });
    const initialHtml = moneyHtml(helpers, p.initial);
    const monthlyHtml = moneyHtml(helpers, p.monthly);
    const monthlyPerMonthHtml = moneyHtml(helpers, p.monthly, { perMonth: true });
    const yearsLabel = `${p.years} ${pluralRu(p.years, 'год', 'года', 'лет')}`;
    const accumulationYieldHtml = formatPercentHtml(p.accumulationYield);
    const inflationHtml = formatPercentHtml(p.inflation);
    const payoutYieldHtml = formatPercentHtml(p.payoutYield);
    const bars = [
        { label: 'Собственные средства', valueHtml: moneyHtml(helpers, p.composition.own, { short: true }), percent: barPct(p.composition.own, p.composition.total), color: '#002a4a' },
        { label: 'Инвест. доход и софинанс.', valueHtml: moneyHtml(helpers, p.composition.extra, { short: true }), percent: barPct(p.composition.extra, p.composition.total), color: '#4f8fd9' },
        { label: 'Итоговый капитал', valueHtml: moneyHtml(helpers, p.composition.total, { short: true }), percent: 100, color: '#166534' },
    ];
    const methodBars = [
        { label: 'желаемый доход на пенсии', value: p.targetFuture, html: targetFutureHtml, color: '#002a4a' },
        { label: 'прогноз госпенсии', value: p.stateFuture, html: stateFutureHtml, color: '#7aa6d6' },
        { label: 'доход из личного капитала', value: p.gapFuture, html: gapFutureHtml, color: '#1e6bb8' },
    ];
    const methodMax = Math.max(1, ...methodBars.map((row) => finite(row.value, 0)));
    const ipk = p.statePension.ipkTotal ?? p.statePension.ipkCurrent;
    const fixed = p.statePension.fixedPaymentToday;
    const point = p.statePension.pointCostToday;
    const pensionHeroNarrativeHtml = `Вы хотели бы получать <strong>${targetPresentHtml}</strong> в ${escapeHtml(p.retirementYear)} г. С учётом инфляции ${inflationHtml} это уже <strong>${targetFutureHtml}</strong>. По моим расчётам гос. пенсия составит <strong>${stateTodayHtml}</strong> в сегодняшних рублях, а с учётом инфляции — <strong>${stateFutureHtml}</strong>. Я создала план, как получать <strong>${gapFutureHtml}</strong> дополнительно.`;

    let out = String(html || '');
    if ((out.match(/<article\b[^>]*\bfinam-v2-page\b[^>]*>/g) || []).length > 1) return replaceFinamV2PageArticles(out, (articleHtml) => replacePensionGoalPage(articleHtml, context));
    const pageNo = out.includes('· 2/3') ? 2 : out.includes('· 3/3') ? 3 : 1;
    if (pageNo === 1) {
        out = out.replace(
            /<div class="finam-v2-pension__ai-row">[\s\S]*?<\/div>\s*\n\s*<section class="finam-v2-pension__hero">/,
            `<h1 class="finam-v2-pension__page-title">Цель - ${title}</h1>\n\n    <section class="finam-v2-pension__hero">`
        );
        out = out.replace(/<h1 class="finam-v2-pension__page-title">[\s\S]*?<\/h1>/, `<h1 class="finam-v2-pension__page-title">Цель - ${title}</h1>`);
        out = out.replace(/<div class="finam-v2-pension__kicker">Пенсия[\s\S]*?<\/div>/, '<div class="finam-v2-pension__kicker">Пенсия</div>');
        out = out.replace(/<h1 class="finam-v2-pension__title">[\s\S]*?<\/h1>\s*/, '');
        out = out.replace(/<p class="finam-v2-pension__text">\s*[\s\S]*?\s*<\/p>\s*<\/div>\s*<div class="finam-v2-pension__hero-image">/, `<p class="finam-v2-pension__text">${pensionHeroNarrativeHtml}</p>\n      </div>\n      <div class="finam-v2-pension__hero-image">`);
        out = replaceNthElementByClass(out, 'finam-v2-pension__grid-2', `<div class="finam-v2-pension__grid-2">
      <section class="finam-v2-pension__card"><div class="finam-v2-pension__card-title">Госпенсия</div>${pensionRow('Год выхода на пенсию', escapeHtml(p.retirementYear))}${pensionRow('Прогноз сегодня', stateTodayHtml)}${pensionRow(`Прогноз с инфляцией ${inflationHtml}`, stateFutureHtml)}${pensionRow('Инфляция модели', inflationHtml)}</section>
      <section class="finam-v2-pension__card"><div class="finam-v2-pension__card-title">Пенсионный разрыв</div><p class="finam-v2-pension__text">Нехватка дохода сегодня — <strong>${gapTodayHtml}</strong>. С учётом инфляции к пенсии:</p><div class="finam-v2-pension__big-value">${gapFutureHtml}</div><div class="finam-v2-pension__big-sub">дополнительный доход в месяц</div></section>
    </div>`, 1);
        out = out.replace(/<div class="finam-v2-pension__capital-value">[\s\S]*?<\/div>/, `<div class="finam-v2-pension__capital-value">${capitalHtml}</div>`);
        out = out.replace(/Ориентир доходности для выплат[\s\S]*?потребуется капитал примерно <strong>[\s\S]*?<\/strong>\./, `Для получения дополнительного дохода ${gapFutureHtml} понадобится капитал <strong>${capitalHtml}</strong>. В плане считаем, что его можно инвестировать под ${payoutYieldHtml} годовых в депозиты, облигации и другие консервативные инструменты.`);
        out = replaceFirstMatches(out, /<div class="finam-v2-pension__metric-value">[\s\S]*?<\/div>/g, [`<div class="finam-v2-pension__metric-value">${initialHtml}</div>`, `<div class="finam-v2-pension__metric-value">${monthlyHtml}</div>`, `<div class="finam-v2-pension__metric-value">${escapeHtml(yearsLabel)}</div>`, `<div class="finam-v2-pension__metric-value">${accumulationYieldHtml}</div>`, `<div class="finam-v2-pension__metric-value">${capitalShort}</div>`]);
        out = out.replace(/<div class="finam-v2-pension__product-name">[\s\S]*?<\/div>/, `<div class="finam-v2-pension__product-name">${escapeHtml(p.instrumentName)}</div>`);
        out = out.replace(/<div class="finam-v2-pension__rate-value">[\s\S]*?<\/div>/, `<div class="finam-v2-pension__rate-value">${accumulationYieldHtml}</div>`);
        out = replaceFirstMatches(out, /<div class="finam-v2-pension__row"><span>(Тип|Доля в цели|Начальная сумма|Ежемесячное пополнение)<\/span><span>[\s\S]*?<\/span><\/div>/g, [pensionRow('Тип', escapeHtml(p.instrumentType)), pensionRow('Доля в цели', escapeHtml(p.shareLabel)), pensionRow('Начальная сумма', initialHtml), pensionRow('Ежемесячное пополнение', monthlyHtml)]);
    } else if (pageNo === 2) {
        out = out.replace(/<div class="finam-v2-pension__bubble finam-v2-pension__bubble--green">[\s\S]*?<\/div>\s*<\/div>\s*<p class="finam-v2-pension__section-kicker">/, `<div class="finam-v2-pension__bubble finam-v2-pension__bubble--green"><p>Собственные взносы, инвестиционный доход и софинансирование дают базу; итоговая сумма <strong>${capitalHtml}</strong> идёт из графика цели.</p></div>\n    </div>\n\n    <p class="finam-v2-pension__section-kicker">`);
        out = replaceNthElementByClass(out, 'finam-v2-pension__bars', buildGoalBarsHtml('pension', bars), 1);
        out = out.replace(/<div class="finam-v2-pension__capital-value"[^>]*>[\s\S]*?<\/div>/, `<div class="finam-v2-pension__capital-value" style="text-align: center;">${moneyHtml(helpers, p.capital)}</div>`);
        out = replaceGoalBenefitsBlock(out, 'pension', buildGoalBenefitsHtml('pension', 'Софинансирование и вычеты', [
            { kind: 'tax', label: `Вычет ${p.taxYear.year}`, amount: p.taxYear.amount },
            { kind: 'tax', label: 'Вычеты всего', amount: p.totalTax },
            { kind: 'cofin', label: `Софинанс. ${p.cofinYear.year}`, amount: p.cofinYear.amount },
            { kind: 'cofin', label: 'Софинанс. всего', amount: p.totalCofin },
        ], helpers));
        out = out.replace(/<div class="finam-v2-pension__chart-title">Прогноз капитала:[\s\S]*?<\/div>/, `<div class="finam-v2-pension__chart-title">Прогноз капитала: ${escapeHtml(firstScheduleYear(goal))} — ${escapeHtml(p.retirementYear)}</div>`);
        out = out.replace(/<div class="finam-v2-pension__chart-total">[\s\S]*?<\/div>/, `<div class="finam-v2-pension__chart-total">${capitalHtml}</div>`);
        out = out.replace(/<svg viewBox="0 0 500 210"[\s\S]*?<\/svg>/, buildGoalCapitalChartSvg({ goal, initial: p.initial, final: p.capital, months: p.months, blockName: 'pension-capital-chart-svg', gradientId: 'finamV2PensionChartGrad', height: 150 }));
        out = out.replace(/<div class="finam-v2-pension__bubble finam-v2-pension__bubble--green">\s*<p>\s*<strong>Ключевой вывод:[\s\S]*?<\/div>/, `<div class="finam-v2-pension__bubble finam-v2-pension__bubble--green"><p><strong>Ключевой вывод:</strong> главный вклад даёт срок; пересчитывать цель надо при изменении взноса или доходности.</p></div>`);
    } else {
        out = out.replace(/<div class="finam-v2-pension__bubble">[\s\S]*?<\/div>\s*<\/div>\s*<section class="finam-v2-pension__method-hero">/, `<div class="finam-v2-pension__bubble"><p>Госпенсия — модельный ориентир: год ${escapeHtml(p.retirementYear)}, оценка сегодня ${stateTodayHtml}, прогноз ${stateFutureHtml}.</p></div>\n    </div>\n\n    <section class="finam-v2-pension__method-hero">`);
        out = out.replace(/<div class="finam-v2-pension__method-score-value">[\s\S]*?<\/div>/, `<div class="finam-v2-pension__method-score-value">${stateTodayHtml}</div>`);
        out = out.replace(/<p class="finam-v2-pension__formula-note">[\s\S]*?<\/p>/, `<p class="finam-v2-pension__formula-note">Фиксированная выплата ${fixed != null ? moneyHtml(helpers, fixed) : '—'}, ИПК ${escapeHtml(formatNumberRu(ipk, 1))}, стоимость ИПК ${point != null ? moneyHtml(helpers, point) : '—'}. Индексация ${inflationHtml} на ${escapeHtml(yearsLabel)} даёт около ${stateFutureHtml}.</p>`);
        out = out.replace(/Определяем горизонт до выхода на пенсию:[\s\S]*?<\/p>/, `Определяем горизонт: ${escapeHtml(yearsLabel)}, до ${escapeHtml(p.retirementYear)} года.</p>`);
        out = out.replace(/модельную индексацию 5,6% в год/g, `модельную индексацию ${inflationHtml} в год`);
        out = out.replace(/<div class="finam-v2-pension__chart-total">разрыв[\s\S]*?<\/div>/, `<div class="finam-v2-pension__chart-total">разрыв ${moneyHtml(helpers, p.gapFuture, { short: true, perMonth: true })}</div>`);
        out = replaceNthElementByClass(out, 'finam-v2-pension__method-bars', `<div class="finam-v2-pension__method-bars" aria-label="Сравнение желаемого дохода, госпенсии и разрыва">
        ${methodBars.map((row) => `<div class="finam-v2-pension__method-bar">
          <div class="finam-v2-pension__method-bar-value">${row.html}</div>
          <div class="finam-v2-pension__method-bar-fill" style="height: ${Math.max(12, Math.round((finite(row.value, 0) / methodMax) * 76))}px; background: ${row.color};"></div>
          <div class="finam-v2-pension__method-bar-label">${escapeHtml(row.label)}</div>
        </div>`).join('\n        ')}
      </div>`, 1);
        out = replaceFirstMatches(out, /<div class="finam-v2-pension__method-bar-value">[\s\S]*?<\/div>/g, methodBars.map((row) => `<div class="finam-v2-pension__method-bar-value">${row.html}</div>`));
        out = replaceFirstMatches(out, /<div class="finam-v2-pension__method-bar-fill" style="height:[\s\S]*?<\/div>/g, methodBars.map((row) => `<div class="finam-v2-pension__method-bar-fill" style="height: ${Math.max(12, Math.round((finite(row.value, 0) / methodMax) * 76))}px; background: ${row.color};"></div>`));
        out = out.replace(/около <strong>377&nbsp;376 ₽\/мес<\/strong>/, `около <strong>${gapFutureHtml}</strong>`);
        out = out.replace(/<div class="finam-v2-pension__capital-value">[\s\S]*?<\/div>/, `<div class="finam-v2-pension__capital-value">${capitalHtml}</div>`);
    }
    if (pageNo === 3) {
        out = out.replace(/607&nbsp;000(?:&nbsp;|\s)₽/g, targetFutureHtml);
        out = out.replace(/229&nbsp;589(?:&nbsp;|\s)₽/g, stateFutureHtml);
        out = out.replace(/377&nbsp;376(?:&nbsp;|\s)₽/g, gapFutureHtml);
        out = out.replace(/Чтобы закрыть разрыв\s+около <strong>[\s\S]*?<\/strong>, план формирует личный пенсионный капитал\./, `Чтобы закрыть разрыв около <strong>${gapFutureHtml}</strong>, нужен дополнительный капитал ${capitalHtml}; в плане он работает под ${payoutYieldHtml} годовых в консервативных инструментах.`);
        out = out.replace(/<div class="finam-v2-pension__chart-total">разрыв[\s\S]*?<\/div>/, `<div class="finam-v2-pension__chart-total">разрыв ${moneyHtml(helpers, p.gapFuture, { short: true, perMonth: true })}</div>`);
    }
    return out;
}

const RISK_PROFILE_DETAILS = {
    conservative: {
        label: 'Консервативный',
        description: 'Главный приоритет — сохранность капитала. Портфель делает упор на защитные инструменты, а доходность используется аккуратно, без резких просадок.',
    },
    moderately_conservative: {
        label: 'Умеренно-консервативный',
        description: 'Основа портфеля остаётся защитной, но небольшая доля рыночных инструментов добавляет потенциал роста. Подходит, когда важна устойчивость суммы.',
    },
    balanced: {
        label: 'Сбалансированный',
        description: 'Портфель держит равновесие между сохранностью и ростом капитала. Рыночные инструменты работают на доходность, а защитная часть сглаживает колебания.',
    },
    moderately_aggressive: {
        label: 'Умеренно агрессивный',
        description: 'Доля рыночных инструментов выше, чтобы ускорить рост капитала. Возможны заметные колебания, поэтому важны горизонт инвестирования и регулярный контроль.',
    },
    aggressive: {
        label: 'Агрессивный',
        description: 'Фокус на максимальном долгосрочном росте. Портфель допускает высокую волатильность и просадки, поэтому требует длинного горизонта и дисциплины.',
    },
};

function rawRiskProfileForGoal(goal) {
    const extended = goal?.risk_profile_extended || goal?.risk_profile_details?.risk_profile_extended;
    if (extended !== undefined && extended !== null && String(extended).trim()) {
        return { raw: extended, isExtended: true };
    }
    return {
        raw: goal?.risk_profile_details?.risk_profile || goal?.risk_profile,
        isExtended: false,
    };
}

function normalizeRiskProfileKey(raw, isExtended = false) {
    const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!value) return null;
    if (value === '1') return 'conservative';
    if (value === '2') return isExtended ? 'moderately_conservative' : 'balanced';
    if (value === '3') return isExtended ? 'balanced' : 'aggressive';
    if (value === '4') return 'moderately_aggressive';
    if (value === '5') return 'aggressive';
    if (value.includes('moderately_conservative') || value.includes('moderate_conservative') || /умер.*консер/.test(value)) return 'moderately_conservative';
    if (value.includes('conservative') || /консервативн/.test(value) || value === 'low') return 'conservative';
    if (value.includes('balanced') || value === 'moderate' || value === 'medium' || /сбаланс/.test(value) || /умеренны[ий]/.test(value)) return 'balanced';
    if (value === '4' || value.includes('moderately_aggressive') || value.includes('moderate_aggressive') || /умер.*агрессив/.test(value)) return 'moderately_aggressive';
    if (value.includes('aggressive') || value === 'high' || /агрессив/.test(value)) return 'aggressive';
    return null;
}

function riskProfileDetailsForGoal(goal) {
    const { raw, isExtended } = rawRiskProfileForGoal(goal);
    const key = normalizeRiskProfileKey(raw, isExtended);
    return key ? RISK_PROFILE_DETAILS[key] : {
        label: raw ? String(raw) : 'По анкете клиента',
        description: 'Профиль берётся из риск-анкеты клиента и определяет допустимую долю рыночных инструментов в портфеле цели.',
    };
}

function riskProfileLabelForGoal(goal) {
    return riskProfileDetailsForGoal(goal).label;
}

function replaceRiskProfileBlock(html, prefix, goal) {
    const risk = riskProfileDetailsForGoal(goal);
    let out = String(html || '');
    out = out.replace(
        new RegExp(`<div class="finam-v2-${escapeRegExp(prefix)}__row"><span>Риск-профиль<\\/span><span>[\\s\\S]*?<\\/span><\\/div>`),
        `<div class="finam-v2-${prefix}__row"><span>Риск-профиль</span><span>${escapeHtml(risk.label)}</span></div>`
    );
    out = out.replace(
        new RegExp(`<div class="finam-v2-${escapeRegExp(prefix)}__risk-value">[\\s\\S]*?<\\/div>`),
        `<div class="finam-v2-${prefix}__risk-value">${escapeHtml(risk.label)}</div>`
    );
    out = out.replace(
        new RegExp(`<p class="finam-v2-${escapeRegExp(prefix)}__risk-text">[\\s\\S]*?<\\/p>`),
        `<p class="finam-v2-${prefix}__risk-text">${escapeHtml(risk.description)}</p>`
    );
    return out;
}


function otherSubtype(goal) {
    const raw = `${goal?.goal_title_raw || ''} ${goal?.goal_name || ''} ${goal?.name || ''}`.toLowerCase();
    if (/образован|уч[её]б|реб[её]н|университет|школ/.test(raw)) {
        return { label: 'Образование', asset: 'goal-other-education.webp', kicker: 'Образование / крупная цель' };
    }
    if (/дом|коттедж|загород|дач/.test(raw)) {
        return { label: 'Дом', asset: 'goal-other-house.webp', kicker: 'Дом / недвижимость' };
    }
    if (/квартир|жиль|ипотек|недвиж/.test(raw)) {
        return { label: 'Жильё', asset: 'goal-other-kvartira.webp', kicker: 'Квартира / недвижимость' };
    }
    return { label: 'Другая крупная цель', asset: 'goal-other.webp', kicker: 'Крупная цель' };
}

function fileToDataUrl(relativePath) {
    const abs = path.join(__dirname, relativePath);
    if (!fs.existsSync(abs)) return relativePath;
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

function instrumentRows(goal, amountFallback) {
    const d = goal?.details || {};
    const rows = Array.isArray(d.initial_instruments) ? d.initial_instruments : [];
    return rows.length ? rows : [{ name: 'Портфель цели', share: 100, amount: amountFallback }];
}

function allocationRows(items, totalValue) {
    const colors = ['#002a4a', '#1e6bb8', '#7dd3fc', '#94a3b8', '#d97706'];
    const rows = (Array.isArray(items) ? items : [])
        .map((item, idx) => ({
            label: item?.label || item?.name || item?.assetClass || 'Инструмент',
            percent: finite(item?.percent ?? item?.share ?? item?.value ?? item?.share_percent, 0),
            amount: finite(item?.amount ?? item?.value, 0),
            color: safeCssColor(item?.color, colors[idx % colors.length]),
        }))
        .filter((item) => item.percent > 0 || item.amount > 0)
        .slice(0, 5);
    const percentSum = rows.reduce((sum, item) => sum + item.percent, 0);
    const amountSum = rows.reduce((sum, item) => sum + item.amount, 0);
    if (rows.length && percentSum <= 0 && amountSum > 0) {
        return rows.map((item) => ({ ...item, percent: (item.amount / amountSum) * 100 }));
    }
    if (rows.length && Math.abs(percentSum - 100) > 0.01 && percentSum > 0) {
        return rows.map((item) => ({ ...item, percent: (item.percent / percentSum) * 100 }));
    }
    if (!rows.length && totalValue > 0) {
        return [{ label: 'Портфель цели', percent: 100, amount: totalValue, color: colors[0] }];
    }
    return rows;
}

function buildConicGradient(rows) {
    if (!Array.isArray(rows) || !rows.length) return 'conic-gradient(#e2e8f0 0% 100%)';
    let cursor = 0;
    const segments = rows.map((row, idx) => {
        const start = cursor;
        cursor += finite(row.percent, 0);
        return `${safeCssColor(row.color, idx === 0 ? '#e2e8f0' : '#94a3b8')} ${start.toFixed(1)}% ${cursor.toFixed(1)}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
}

function buildDonutSvg(rows, className) {
    const safeRows = Array.isArray(rows) ? rows : [];
    let cursor = 0;
    const segments = safeRows
        .filter((row) => finite(row.percent, 0) > 0)
        .map((row, idx) => {
            const percent = Math.max(0, Math.min(100, finite(row.percent, 0)));
            const dashOffset = -cursor;
            cursor += percent;
            return `<circle cx="50" cy="50" r="38" fill="none" stroke="${safeCssColor(row.color, idx === 0 ? '#002a4a' : '#94a3b8')}" stroke-width="20" pathLength="100" stroke-dasharray="${percent.toFixed(3)} ${(100 - percent).toFixed(3)}" stroke-dashoffset="${dashOffset.toFixed(3)}" />`;
        })
        .join('');
    return `<svg class="${escapeHtml(className || '')}" viewBox="0 0 100 100" width="82" height="82" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#e2e8f0" stroke-width="20" />
              <g transform="rotate(-90 50 50)">${segments}</g>
            </svg>`;
}

function buildAllocationHtml(prefix, kind, title, sub, centerHtml, rows) {
    const safeRows = allocationRows(rows, 0);
    return `<div class="finam-v2-${prefix}__allocation">
          <div class="finam-v2-${prefix}__donut" style="background: transparent;">
            ${buildDonutSvg(safeRows, `finam-v2-${prefix}__donut-svg`)}
            <div class="finam-v2-${prefix}__donut-center">${centerHtml}</div>
          </div>
          <div>
            <div class="finam-v2-${prefix}__allocation-title">${escapeHtml(title)}</div>
            <div class="finam-v2-${prefix}__allocation-sub">${escapeHtml(sub)}</div>
            <ul class="finam-v2-${prefix}__legend" data-finam-v2-block="${kind}">
              ${safeRows.length ? safeRows.map((row) => `<li><span class="finam-v2-${prefix}__legend-dot" style="background:${safeCssColor(row.color, '#94a3b8')};"></span><span>${escapeHtml(row.label)}</span><span class="finam-v2-${prefix}__legend-value">${finite(row.percent, 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</span></li>`).join('\n              ') : '<li style="grid-template-columns: minmax(0, 1fr);"><span>Структура будет показана после расчёта</span></li>'}
            </ul>
          </div>
        </div>`;
}

function benefitIconSvg(kind) {
    if (kind === 'cofin') {
        return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M18 8v6M15 11h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h7M9 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>`;
}

function buildGoalBenefitsHtml(prefix, title, items, helpers) {
    const visibleItems = (Array.isArray(items) ? items : [])
        .map((item) => ({ ...item, amount: finite(item?.amount, 0) }))
        .filter((item) => item.amount > 0);
    if (!visibleItems.length) return '';
    return `<p class="finam-v2-${prefix}__section-kicker">${escapeHtml(title)}</p>
    <div class="finam-v2-${prefix}__benefits">
      ${visibleItems.map((item) => `<div class="finam-v2-${prefix}__benefit">
        ${benefitIconSvg(item.kind)}
        <div><div class="finam-v2-${prefix}__benefit-label">${escapeHtml(item.label)}</div><div class="finam-v2-${prefix}__benefit-value">${moneyHtml(helpers, item.amount)}</div></div>
      </div>`).join('\n      ')}
    </div>`;
}

function replaceGoalBenefitsBlock(html, prefix, replacementHtml) {
    const sectionClass = `finam-v2-${prefix}__section-kicker`;
    const benefitsClass = `finam-v2-${prefix}__benefits`;
    const nextSectionClass = `finam-v2-${prefix}__`;
    const re = new RegExp(`<p class="${escapeRegExp(sectionClass)}">(?:Налоговые|Софинансирование)[\\s\\S]*?<\\/p>\\s*<div class="${escapeRegExp(benefitsClass)}">[\\s\\S]*?<\\/div>\\s*(?=<section class="${escapeRegExp(nextSectionClass)})`);
    return String(html || '').replace(re, replacementHtml ? `${replacementHtml}\n\n    ` : '');
}

function goalBenefitsSummary(goal) {
    const s = goal?.summary || {};
    const d = goal?.details || {};
    const taxYear = scheduleYearAmount(goal, 'tax_deduction');
    const cofinYear = scheduleYearAmount(goal, 'cofinancing');
    const totalTax = finite(s.total_tax_benefit ?? s.total_tax_deductions ?? d.total_tax_deductions ?? d.total_tax_refund, taxYear.amount);
    const totalCofin = finite(s.total_cofinancing ?? d.total_cofinancing ?? d.total_cofinancing_nominal, cofinYear.amount);
    return {
        taxYear,
        cofinYear,
        totalTax,
        totalCofin,
    };
}

function normalizeInvestmentGoalArtifacts(goal) {
    const s = goal?.summary || {};
    const d = goal?.details || {};
    const initial = finite(s.initial_capital ?? d.initial_capital ?? goal?.initial_capital, 0);
    const monthly = finite(s.monthly_replenishment ?? d.monthly_replenishment ?? goal?.monthly_replenishment, 0);
    return {
        initial,
        monthly,
        benefits: goalBenefitsSummary(goal),
        initialAllocation: allocationRows(d.initial_instruments, initial),
        monthlyAllocation: allocationRows(d.monthly_instruments, monthly),
    };
}

function replaceInvestmentGoalArtifacts(html, context, prefix) {
    const { goal, helpers } = context;
    if (!goal) return html;
    let out = String(html || '');
    if ((out.match(/<article\b[^>]*\bfinam-v2-page\b[^>]*>/g) || []).length > 1) {
        return replaceFinamV2PageArticles(out, (articleHtml) => replaceInvestmentGoalArtifacts(articleHtml, context, prefix));
    }
    out = replaceRiskProfileBlock(out, prefix, goal);
    if (!out.includes('· 2/2')) return out;

    const data = normalizeInvestmentGoalArtifacts(goal);
    const taxUsesYear = data.benefits.taxYear.amount > 0;
    const cofinUsesYear = data.benefits.cofinYear.amount > 0;
    const benefitsHtml = buildGoalBenefitsHtml(prefix, 'Налоговые вычеты и софинансирование', [
        { kind: 'tax', label: taxUsesYear ? 'Налоговый вычет за год' : 'Налоговые вычеты за период', amount: taxUsesYear ? data.benefits.taxYear.amount : data.benefits.totalTax },
        { kind: 'cofin', label: cofinUsesYear ? 'Софинансирование за год' : 'Софинансирование за период', amount: cofinUsesYear ? data.benefits.cofinYear.amount : data.benefits.totalCofin },
    ], helpers);

    out = replaceGoalBenefitsBlock(out, prefix, benefitsHtml);
    out = replaceNthElementByClass(out, `finam-v2-${prefix}__allocation`, buildAllocationHtml(prefix, `${prefix}-initial-allocation`, 'Первоначальный капитал', 'стартовая сумма', `${escapeHtml(formatShortMoneyNoCurrency(helpers, data.initial))}<small>старт</small>`, data.initialAllocation), 1);
    out = replaceNthElementByClass(out, `finam-v2-${prefix}__allocation`, buildAllocationHtml(prefix, `${prefix}-monthly-allocation`, 'Ежемесячное пополнение', 'новый взнос', `${escapeHtml(formatShortMoneyNoCurrency(helpers, data.monthly))}<small>в месяц</small>`, data.monthlyAllocation), 2);
    return out;
}

function normalizeOtherGoal(goal, helpers) {
    const s = goal?.summary || {};
    const d = goal?.details || {};
    const months = goalMonthsValue(goal);
    const initial = finite(s.initial_capital ?? d.initial_capital ?? goal?.initial_capital, 0);
    const monthly = finite(s.monthly_replenishment ?? d.monthly_replenishment ?? goal?.monthly_replenishment, 0);
    const now = finite(s.target_amount_initial ?? s.current_cost ?? goal?.target_amount, 0);
    const future = finite(s.target_amount_future ?? s.projected_capital_at_end ?? goal?.target_amount_future, now);
    const projected = finite(s.projected_capital_at_end ?? future, future);
    const tax = finite(s.total_tax_benefit ?? d.total_tax_deductions, 0);
    const cofin = finite(s.total_cofinancing ?? d.total_cofinancing, 0);
    const composition = capitalComposition({ initial, monthly, months, total: projected, tax, cofin });
    const subtype = otherSubtype(goal);
    return {
        title: goalName(goal, helpers),
        subtype,
        months,
        initial,
        monthly,
        now,
        future,
        projected,
        targetYear: targetYearFromGoal(goal, months),
        inflation: maybeFinite(s.inflation_rate),
        yieldPercent: maybeFinite(s.accumulation_yield_percent ?? goal?.pdf_metrics?.portfolio_yield_percent),
        riskProfile: riskProfileDetailsForGoal(goal),
        tax,
        cofin,
        composition,
        initialAllocation: allocationRows(d.initial_instruments, initial),
        monthlyAllocation: allocationRows(d.monthly_instruments, monthly),
    };
}

function otherRow(label, valueHtml) {
    return `<div class="finam-v2-other__row"><span>${escapeHtml(label)}</span><span>${valueHtml}</span></div>`;
}

function replaceOtherGoalPage(html, context) {
    const { goal, helpers } = context;
    if (!goal) return html;
    const other = normalizeOtherGoal(goal, helpers);
    const title = escapeHtml(other.title);
    const futureHtml = moneyHtml(helpers, other.future, { short: true });
    const projectedHtml = moneyHtml(helpers, other.projected, { short: true });
    const nowHtml = moneyHtml(helpers, other.now, { short: true });
    const initialHtml = moneyHtml(helpers, other.initial, { short: true });
    const monthlyHtml = moneyHtml(helpers, other.monthly);
    const monthsLabel = yearsLabelFromMonths(other.months);
    const yieldHtml = formatPercentHtml(other.yieldPercent);
    const inflationHtml = formatPercentHtml(other.inflation);
    const assetUrl = fileToDataUrl(`assets/${other.subtype.asset}`);
    const aiAvatarUrl = fileToDataUrl('assets/avatar-ai-finam-v2.png');
    const bars = [
        { label: 'Стартовый капитал', valueHtml: moneyHtml(helpers, other.initial, { short: true }), percent: barPct(other.initial, other.composition.total), color: '#002a4a' },
        { label: 'Пополнения', valueHtml: moneyHtml(helpers, other.composition.replenishments, { short: true }), percent: barPct(other.composition.replenishments, other.composition.total), color: '#1e6bb8' },
        { label: 'Инвест. доход', valueHtml: moneyHtml(helpers, other.composition.investment || other.composition.extra, { short: true }), percent: barPct(other.composition.investment || other.composition.extra, other.composition.total), color: '#4f8fd9' },
        { label: 'Итоговый капитал', valueHtml: moneyHtml(helpers, other.composition.total, { short: true }), percent: 100, color: '#166534' },
    ];
    let out = String(html || '');
    if ((out.match(/<article\b[^>]*\bfinam-v2-page\b[^>]*>/g) || []).length > 1) return replaceFinamV2PageArticles(out, (articleHtml) => replaceOtherGoalPage(articleHtml, context));
    const pageNo = out.includes('· 2/2') ? 2 : 1;
    if (pageNo === 1) {
        out = out.replace(/<h1 class="finam-v2-other__page-title">[\s\S]*?<\/h1>/, `<h1 class="finam-v2-other__page-title">Цель - ${title}</h1>`);
        out = out.replace(/<div class="finam-v2-other__bubble">[\s\S]*?<\/div>\s*<\/div>\s*<section class="finam-v2-other__hero">/, `<h1 class="finam-v2-other__page-title">Цель - ${title}</h1>\n\n    <section class="finam-v2-other__hero">`);
        out = out.replace(/<div class="finam-v2-other__kicker">[\s\S]*?<\/div>/, `<div class="finam-v2-other__kicker">${escapeHtml(other.subtype.kicker)}</div>`);
        out = out.replace(/<h1 class="finam-v2-other__title">[\s\S]*?<\/h1>\s*/, '');
        out = out.replace(/<div class="finam-v2-other__ai-row">[\s\S]*?<\/div>\s*<\/div>\s*<div class="finam-v2-other__hero-visual">/, `<div class="finam-v2-other__ai-row">
          <div class="finam-v2-other__avatar" role="img" aria-label="ИИ-ассистент">
            <img src="${escapeHtml(aiAvatarUrl)}" width="42" height="42" alt="" decoding="async" />
          </div>
          <div class="finam-v2-other__bubble">
            <p>Стоимость цели в текущих деньгах — <strong>${nowHtml}</strong>; с учётом инфляции к ${escapeHtml(other.targetYear)} году ориентир становится <strong>${futureHtml}</strong>.</p>
          </div>
        </div>
      </div>
      <div class="finam-v2-other__hero-visual">`);
        out = out.replace(/<img src="[^"]*" width="156" height="116" alt="" decoding="async" \/>/, `<img src="${assetUrl}" width="156" height="116" alt="" decoding="async" />`);
        out = out.replace(/<div class="finam-v2-other__visual-value">[\s\S]*?<\/div>/, `<div class="finam-v2-other__visual-value">${escapeHtml(formatShortMoneyNoCurrency(helpers, other.future))}</div>`);
        out = replaceNthElementByClass(out, 'finam-v2-other__grid-2', `<div class="finam-v2-other__grid-2">
      <section class="finam-v2-other__card"><div class="finam-v2-other__card-title">Параметры цели</div>${otherRow('Подтип цели', escapeHtml(other.subtype.label))}${otherRow('Плановая дата', escapeHtml(other.targetYear))}${otherRow('Стоимость сейчас', nowHtml)}${otherRow('Инфляция модели', inflationHtml)}</section>
      <section class="finam-v2-other__card"><div class="finam-v2-other__card-title">Сумма с учётом инфляции</div><p class="finam-v2-other__text">На дату реализации эта сумма становится ориентиром для пополнений.</p><div class="finam-v2-other__big-value">${futureHtml}</div><div class="finam-v2-other__big-sub">целевой капитал к ${escapeHtml(other.targetYear)} году</div></section>
    </div>`, 1);
        out = out.replace(/<div class="finam-v2-other__capital-value">[\s\S]*?<\/div>/, `<div class="finam-v2-other__capital-value">${futureHtml}</div>`);
        out = replaceFirstMatches(out, /<div class="finam-v2-other__metric-value">[\s\S]*?<\/div>/g, [`<div class="finam-v2-other__metric-value">${initialHtml}</div>`, `<div class="finam-v2-other__metric-value">${monthlyHtml}</div>`, `<div class="finam-v2-other__metric-value">${escapeHtml(monthsLabel)}</div>`, `<div class="finam-v2-other__metric-value">${yieldHtml}</div>`]);
        out = replaceRiskProfileBlock(out, 'other', goal);
    } else {
        out = out.replace(/<div class="finam-v2-other__bubble finam-v2-other__bubble--green">[\s\S]*?<\/div>\s*<\/div>\s*<p class="finam-v2-other__section-kicker">/, `<div class="finam-v2-other__bubble finam-v2-other__bubble--green"><p>Стартовый капитал, пополнения и портфель формируют прогнозный капитал <strong>${projectedHtml}</strong>.</p></div>\n    </div>\n\n    <p class="finam-v2-other__section-kicker">`);
        out = replaceNthElementByClass(out, 'finam-v2-other__bars', buildGoalBarsHtml('other', bars), 1);
        out = replaceGoalBenefitsBlock(out, 'other', buildGoalBenefitsHtml('other', 'Налоговые вычеты и софинансирование', [
            { kind: 'tax', label: 'Налоговый эффект', amount: other.tax },
            { kind: 'cofin', label: 'Софинансирование цели', amount: other.cofin },
        ], helpers));
        out = replaceNthElementByClass(out, 'finam-v2-other__allocation', buildAllocationHtml('other', 'other-initial-allocation', 'Первоначальный капитал', 'стартовая сумма', `${escapeHtml(formatShortMoneyNoCurrency(helpers, other.initial))}<small>старт</small>`, other.initialAllocation), 1);
        out = replaceNthElementByClass(out, 'finam-v2-other__allocation', buildAllocationHtml('other', 'other-monthly-allocation', 'Ежемесячное пополнение', 'новый взнос', `${escapeHtml(formatShortMoneyNoCurrency(helpers, other.monthly))}<small>в месяц</small>`, other.monthlyAllocation), 2);
        out = out.replace(/<div class="finam-v2-other__chart-title">Прогноз капитала:[\s\S]*?<\/div>/, `<div class="finam-v2-other__chart-title">Прогноз капитала: ${escapeHtml(firstScheduleYear(goal))} — ${escapeHtml(other.targetYear)}</div>`);
        out = out.replace(/<div class="finam-v2-other__chart-total">[\s\S]*?<\/div>/, `<div class="finam-v2-other__chart-total">${projectedHtml}</div>`);
        out = out.replace(/<svg viewBox="0 0 500 210"[\s\S]*?<\/svg>/, buildGoalCapitalChartSvg({ goal, initial: other.initial, final: other.projected, months: other.months, blockName: 'other-capital-chart-svg', gradientId: 'finamV2OtherChartGrad', height: 150 }));
        out = out.replace(/<div class="finam-v2-other__bubble finam-v2-other__bubble--green">\s*<p>\s*<strong>Ключевой вывод:[\s\S]*?<\/div>/, `<div class="finam-v2-other__bubble finam-v2-other__bubble--green"><p><strong>Ключевой вывод:</strong> снижать риск надо по мере приближения ${escapeHtml(other.targetYear)} года и пересчитывать стоимость цели.</p></div>`);
    }
    return out;
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

function formatPercentValue(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

function moneyNoCurrencyHtml(helpers, value, opts = {}) {
    return moneyHtml(helpers, value, opts)
        .replace(/&nbsp;₽\/мес$/, '')
        .replace(/&nbsp;₽$/, '');
}

function isPensionMonthlyCostRow(row) {
    return row?.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION;
}

function goalCostHtml(row, field, helpers) {
    const value = finite(row?.[field], 0);
    if (value <= 0) return '—';
    return isPensionMonthlyCostRow(row)
        ? moneyHtml(helpers, value, { short: true, perMonth: true })
        : moneyNoCurrencyHtml(helpers, value, { short: true });
}

function inlineGoalIconSvg(pageType) {
    const pathByType = {
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE]: '<path d="M12 3l8 4v6c0 5-8 8-8 8s-8-3-8-8V7l8-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />',
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE]: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />',
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION]: '<path d="M12 8v8M8 12h8M4 19h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />',
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME]: '<path d="M4 19V5M4 19h16M8 17l3-6 4 3 5-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />',
        [FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW]: '<path d="M4 18h4l10-10M9 5h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />',
    };
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">${pathByType[pageType] || '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />'}</svg>`;
}

function groupIconSvg(groupId) {
    const paths = {
        protection: '<path d="M12 3l7 4v5c0 5-3 9-7 11-4-2-7-6-7-11V7l7-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />',
        savings: '<rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" /><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />',
        pension: '<path d="M4 19V5M4 19h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M7 15l4-5 3 3 5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />',
    };
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">${paths[groupId] || paths.savings}</svg>`;
}

function insightIconSvg() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>';
}

function takeawayIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" /><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>';
}

function buildGoalsPillarsHtml(diagnostics, helpers) {
    const groups = Array.isArray(diagnostics?.groups) ? diagnostics.groups : [];
    return `<div class="finam-v2-goals__pillars">
      ${groups.map((group) => {
        const rows = (group.goals || []).slice(0, 3).map((goal) => `<div class="finam-v2-goals__pillar-line">
          <span>${escapeHtml(goal.title)}</span>
          <span>${moneyHtml(helpers, goal.monthly)}</span>
        </div>`).join('\n        ');
        const rest = (group.goals || []).length > 3
            ? `<div class="finam-v2-goals__pillar-line">
          <span>Ещё ${(group.goals || []).length - 3}</span>
          <span>ц.</span>
        </div>`
            : '';
        return `<div class="finam-v2-goals__pillar">
        <div class="finam-v2-goals__pillar-head">
          ${groupIconSvg(group.id)}
          <span class="finam-v2-goals__pillar-title">${escapeHtml(group.title)}</span>
        </div>
        ${rows || '<div class="finam-v2-goals__pillar-line"><span>Нет целей</span><span>—</span></div>'}
        ${rest}
        <div class="finam-v2-goals__pillar-total">
          <span>Итого</span>
          <span>${moneyHtml(helpers, group.monthly, { perMonth: true })}</span>
        </div>
      </div>`;
    }).join('\n      ')}
    </div>`;
}

function buildGoalsDistributionHtml(diagnostics, helpers) {
    const colors = ['#002a4a', '#1e6bb8', '#93c5fd'];
    const groups = (Array.isArray(diagnostics?.groups) ? diagnostics.groups : []).filter((group) => group.monthly > 0);
    const segments = groups.length
        ? groups.map((group, index) => `<div class="finam-v2-goals__stack-seg" style="width: ${Math.max(group.percent, 0).toFixed(3)}%; background: ${colors[index % colors.length]};"></div>`).join('\n          ')
        : '<div class="finam-v2-goals__stack-seg" style="width: 100%; background: #cbd5e1;"></div>';
    const legend = groups.length
        ? groups.map((group) => `<div class="finam-v2-goals__legend-row"><strong>${escapeHtml(formatPercentValue(group.percent))}</strong> ${escapeHtml(group.title)} — ${moneyHtml(helpers, group.monthly, { perMonth: true })}</div>`).join('\n          ')
        : '<div class="finam-v2-goals__legend-row"><strong>—</strong> Цели с пополнениями не найдены</div>';
    const insights = (Array.isArray(diagnostics?.insights) ? diagnostics.insights : [])
        .slice(0, 4)
        .map((text) => `<li>
            ${insightIconSvg()}
            <span>${escapeHtml(text)}</span>
          </li>`)
        .join('\n          ');

    return `<div class="finam-v2-goals__dist">
      <div class="finam-v2-goals__dist-left">
        <div class="finam-v2-goals__stack-wrap" aria-hidden="true">
          ${segments}
        </div>
        <div class="finam-v2-goals__legend">
          ${legend}
        </div>
      </div>
      <div class="finam-v2-goals__insights">
        <div class="finam-v2-goals__insights-title">Что меняет решение</div>
        <ul>
          ${insights || `<li>${insightIconSvg()}<span>После добавления целей здесь появятся расчётные выводы.</span></li>`}
        </ul>
      </div>
    </div>`;
}

function buildGoalsTableRowsHtml(diagnostics, helpers) {
    const rows = Array.isArray(diagnostics?.tableRows) ? diagnostics.tableRows : [];
    const body = rows.map((row) => `<tr>
            <td>
              <div class="finam-v2-goals__cell-goal">
                ${inlineGoalIconSvg(row.pageType)}
                <strong>${escapeHtml(row.title)}</strong>
              </div>
            </td>
            <td class="num">${escapeHtml(row.term || '—')}</td>
            <td class="num">${row.monthly > 0 ? moneyNoCurrencyHtml(helpers, row.monthly) : '—'}</td>
            <td class="num">${row.capital > 0 ? moneyNoCurrencyHtml(helpers, row.capital, { short: true }) : '—'}</td>
            <td class="num">${goalCostHtml(row, 'costNow', helpers)}</td>
            <td class="num">${goalCostHtml(row, 'costFuture', helpers)}</td>
          </tr>`).join('\n          ');
    const rest = diagnostics?.remainingCount > 0
        ? `<tr><td colspan="6">Ещё ${Number(diagnostics.remainingCount).toLocaleString('ru-RU')} ${pluralRu(diagnostics.remainingCount, 'цель', 'цели', 'целей')} показаны в детальных разделах отчёта.</td></tr>`
        : '';
    return body || rest ? `${body}${rest ? `\n          ${rest}` : ''}` : '<tr><td colspan="6">Цели не найдены</td></tr>';
}

function buildGoalsTakeawaysHtml(diagnostics) {
    const takeaways = (Array.isArray(diagnostics?.takeaways) ? diagnostics.takeaways : []).slice(0, 3);
    return `<div class="finam-v2-goals__takeaways">
      ${takeaways.map((text) => `<div class="finam-v2-goals__takeaway">
        ${takeawayIconSvg()}
        <p>${escapeHtml(text)}</p>
      </div>`).join('\n      ') || `<div class="finam-v2-goals__takeaway">${takeawayIconSvg()}<p>После расчёта целей здесь появятся управленческие выводы.</p></div>`}
    </div>`;
}

function replaceGoalsPage(html, { model, helpers }) {
    const diagnostics = model?.goalsDiagnostics || {};
    let out = String(html || '');

    out = out.replace(
        /<h1 class="finam-v2-goals__hero">[\s\S]*?<\/h1>/,
        `<h1 class="finam-v2-goals__hero">${escapeHtml(diagnostics.headline || 'Портфель целей сформирован по расчётам')}</h1>`
    );
    out = out.replace(
        /<p class="finam-v2-goals__sub">[\s\S]*?<\/p>/,
        `<p class="finam-v2-goals__sub">${escapeHtml(diagnostics.subline || 'Цифры на странице собраны из расчётной модели клиента.')}</p>`
    );
    out = out.replace(
        /<div class="finam-v2-goals__pillars">[\s\S]*?<\/div>\s*\n\s*<p class="finam-v2-goals__section-kicker">Распределение ежемесячного ресурса<\/p>/,
        `${buildGoalsPillarsHtml(diagnostics, helpers)}\n\n    <p class="finam-v2-goals__section-kicker">Распределение ежемесячного ресурса</p>`
    );
    out = out.replace(
        /<div class="finam-v2-goals__dist">[\s\S]*?<\/div>\s*\n\s*<p class="finam-v2-goals__section-kicker">Ключевые цели \(детализация\)<\/p>/,
        `${buildGoalsDistributionHtml(diagnostics, helpers)}\n\n    <p class="finam-v2-goals__section-kicker">Ключевые цели (детализация)</p>`
    );
    out = out.replace(
        /(<tbody>\s*)[\s\S]*?(\s*<\/tbody>)/,
        (_match, before, after) => `${before}${buildGoalsTableRowsHtml(diagnostics, helpers)}${after}`
    );
    out = out.replace(
        /<div class="finam-v2-goals__takeaways">[\s\S]*?<\/div>\s*\n\s*<div class="finam-v2-goals__grow"><\/div>/,
        `${buildGoalsTakeawaysHtml(diagnostics)}\n\n    <div class="finam-v2-goals__grow"></div>`
    );
    return out;
}

function buildExecutiveSplitHtml(decision) {
    return `<section class="finam-v2-wow__split">
      <div class="finam-v2-wow__insight">
        <strong>Ключевой вывод:</strong> ${escapeHtml(decision.keyInsight || 'План требует регулярного пересчёта по фактическим данным клиента.')}
      </div>
      <div class="finam-v2-wow__score">
        <div class="finam-v2-wow__score-value">${escapeHtml(decision.sustainabilityIndex || '—')}</div>
        <div class="finam-v2-wow__score-label">индекс финансовой устойчивости из 10</div>
      </div>
    </section>`;
}

function buildExecutiveCardsHtml(decision) {
    const titleByKind = {
        risk: 'Главный риск',
        lever: 'Главный рычаг',
        effect: 'Главный эффект',
    };
    const classByKind = {
        risk: ' finam-v2-wow__card--warn',
        lever: ' finam-v2-wow__card--green',
        effect: '',
    };
    const cards = Array.isArray(decision?.cards) ? decision.cards.slice(0, 3) : [];
    return `<div class="finam-v2-wow__grid-3">
      ${cards.map((card) => `<section class="finam-v2-wow__card${classByKind[card.kind] || ''}">
        <div class="finam-v2-wow__card-title">${escapeHtml(titleByKind[card.kind] || card.title || 'Показатель')}</div>
        <div class="finam-v2-wow__metric">${escapeHtml(card.metric || '—')}</div>
        <p class="finam-v2-wow__metric-sub">${escapeHtml(card.body || '')}</p>
      </section>`).join('\n      ')}
    </div>`;
}

function buildExecutiveRowsHtml(decision) {
    const rows = Array.isArray(decision?.decisionRows) ? decision.decisionRows.slice(0, 3) : [];
    return rows.map((row) => `<tr>
          <td><strong>${escapeHtml(row.decision || 'Решение')}</strong></td>
          <td>${escapeHtml(row.why || '—')}</td>
          <td>${escapeHtml(row.nextStep || '—')}</td>
        </tr>`).join('\n        ') || '<tr><td colspan="3">Сценарий будет собран после расчёта плана.</td></tr>';
}

function replaceExecutiveSummaryPage(html, { model }) {
    const decision = model?.executiveDecision || {};
    let out = String(html || '');

    out = out.replace(
        /<h1 class="finam-v2-wow__headline">[\s\S]*?<\/h1>/,
        `<h1 class="finam-v2-wow__headline">${escapeHtml(decision.headline || 'Управленческий вывод собран из расчётов')}</h1>`
    );
    out = out.replace(
        /<p class="finam-v2-wow__lead">[\s\S]*?<\/p>/,
        `<p class="finam-v2-wow__lead">${escapeHtml(decision.lead || 'Страница использует заранее подготовленные сценарии и фактические цифры клиента.')}</p>`
    );
    out = out.replace(
        /<section class="finam-v2-wow__split">[\s\S]*?<\/section>/,
        buildExecutiveSplitHtml(decision)
    );
    out = out.replace(
        /<div class="finam-v2-wow__grid-3">[\s\S]*?<\/div>\s*\n\s*<table class="finam-v2-wow__table">/,
        `${buildExecutiveCardsHtml(decision)}\n\n    <table class="finam-v2-wow__table">`
    );
    out = out.replace(
        /(<tbody>\s*)[\s\S]*?(\s*<\/tbody>)/,
        (_match, before, after) => `${before}${buildExecutiveRowsHtml(decision)}${after}`
    );
    out = out.replace(
        /(<section class="finam-v2-wow__card finam-v2-wow__card--soft">\s*<div class="finam-v2-wow__card-title">Рекомендованный сценарий<\/div>\s*<p class="finam-v2-wow__card-body">)[\s\S]*?(<\/p>\s*<\/section>)/,
        (_match, before, after) => `${before}\n        ${escapeHtml(decision.recommendedScenario || 'Следующий шаг зависит от фактического cash flow и приоритетов целей.')}\n      ${after}`
    );
    return out;
}

function normalizePortfolioRows(items, totalValue, maxRows = 6) {
    const colors = ['#002a4a', '#1e6bb8', '#7aa6d6', '#9fb7ca', '#cbd5e1', '#0f766e'];
    const rows = (Array.isArray(items) ? items : [])
        .map((item, idx) => ({
            label: item?.label || item?.name || item?.assetClass || 'Инструмент',
            percent: finite(item?.percent ?? item?.share ?? item?.share_percent, 0),
            amount: finite(item?.value ?? item?.amount, 0),
            role: item?.role || 'диверсификация портфеля',
            yieldPercent: maybeFinite(item?.yieldPercent ?? item?.yield_percent ?? item?.yield),
            color: safeCssColor(item?.color, colors[idx % colors.length]),
        }))
        .filter((item) => item.percent > 0 || item.amount > 0);
    const amountSum = rows.reduce((sum, item) => sum + item.amount, 0);
    const percentSum = rows.reduce((sum, item) => sum + item.percent, 0);
    let normalized = rows;
    if (rows.length && percentSum <= 0 && amountSum > 0) {
        normalized = rows.map((item) => ({ ...item, percent: (item.amount / amountSum) * 100 }));
    } else if (rows.length && Math.abs(percentSum - 100) > 0.01 && percentSum > 0) {
        normalized = rows.map((item) => ({ ...item, percent: (item.percent / percentSum) * 100 }));
    }
    if (!rows.length && totalValue > 0) {
        return [{ label: 'Портфель', percent: 100, amount: totalValue, role: 'капитал по целям', color: colors[0] }];
    }
    return compactPortfolioRows(normalized, maxRows, colors);
}

function compactPortfolioRows(rows, maxRows, colors) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length <= maxRows) return list;
    const head = list.slice(0, Math.max(1, maxRows - 1));
    const tail = list.slice(Math.max(1, maxRows - 1));
    const amount = tail.reduce((sum, row) => sum + finite(row.amount, 0), 0);
    const percent = tail.reduce((sum, row) => sum + finite(row.percent, 0), 0);
    return [
        ...head,
        {
            label: 'Прочее',
            percent,
            amount,
            role: 'прочие инструменты портфеля',
            color: colors[(maxRows - 1) % colors.length],
        },
    ];
}

function portfolioDonutHtml({ title, sub, centerValue, centerSub, rows, monthly = false }) {
    const safeRows = normalizePortfolioRows(rows, 0, 5);
    const note = safeRows.length
        ? safeRows.slice(0, 4).map((row) => `${Math.round(finite(row.percent, 0))}% ${row.label}`).join(' · ')
        : 'структура будет показана после расчёта';
    return `<div class="finam-v2-portfolio__donut-card">
          <p class="finam-v2-portfolio__section-kicker">${escapeHtml(title)}</p>
          <div class="finam-v2-portfolio__donut-row">
            <div class="finam-v2-portfolio__donut${monthly ? ' finam-v2-portfolio__donut--monthly' : ''}" style="background: transparent;" aria-hidden="true">
              ${buildDonutSvg(safeRows, 'finam-v2-portfolio__donut-svg')}
              <div class="finam-v2-portfolio__donut-center">${escapeHtml(centerValue)}<small>${escapeHtml(centerSub)}</small></div>
            </div>
            <div>
              <div class="finam-v2-portfolio__donut-title">${escapeHtml(sub)}</div>
              <p class="finam-v2-portfolio__donut-note">${escapeHtml(note)}.</p>
            </div>
          </div>
        </div>`;
}

function portfolioAllocationTableHtml(rows, helpers) {
    const safeRows = normalizePortfolioRows(rows, 0, 6);
    const body = safeRows.map((row) => `<tr>
              <td><span class="finam-v2-portfolio__asset"><span class="finam-v2-portfolio__dot" style="background:${safeCssColor(row.color, '#94a3b8')};"></span>${escapeHtml(row.label)}</span></td>
              <td class="finam-v2-portfolio__num">${formatPercentHtml(row.percent)}</td>
              <td class="finam-v2-portfolio__num">${moneyHtml(helpers, row.amount, { short: true })}</td>
              <td>${escapeHtml(row.role)}</td>
            </tr>`).join('\n');
    return `<table class="finam-v2-portfolio__table">
          <thead>
            <tr>
              <th>Класс</th>
              <th>Доля</th>
              <th>Сумма</th>
              <th>Роль</th>
            </tr>
          </thead>
          <tbody>
            ${body || '<tr><td colspan="4">Портфель будет показан после расчёта.</td></tr>'}
          </tbody>
        </table>`;
}

function portfolioKpiHtml(model, helpers) {
    const p = model?.portfolio || {};
    const yieldText = maybeFinite(p.expectedReturn) != null ? formatPercentHtml(p.expectedReturn) : '—';
    return `<section class="finam-v2-portfolio__kpi">
      <div class="finam-v2-portfolio__kpi-item">
        <div class="finam-v2-portfolio__kpi-label">Итоговый капитал</div>
        <div class="finam-v2-portfolio__kpi-value">${moneyHtml(helpers, p.projectedTotal, { short: true })}</div>
        <div class="finam-v2-portfolio__kpi-note">сумма по всем целям</div>
      </div>
      <div class="finam-v2-portfolio__kpi-item">
        <div class="finam-v2-portfolio__kpi-label">Горизонт</div>
        <div class="finam-v2-portfolio__kpi-value">${escapeHtml(p.horizonLabel || maxGoalYears(model?.goals))}</div>
        <div class="finam-v2-portfolio__kpi-note">максимальный срок цели</div>
      </div>
      <div class="finam-v2-portfolio__kpi-item">
        <div class="finam-v2-portfolio__kpi-label">Пополнение</div>
        <div class="finam-v2-portfolio__kpi-value">${moneyHtml(helpers, p.monthlyTotal, { short: true })}</div>
        <div class="finam-v2-portfolio__kpi-note">ежемесячно</div>
      </div>
      <div class="finam-v2-portfolio__kpi-item">
        <div class="finam-v2-portfolio__kpi-label">Доходность</div>
        <div class="finam-v2-portfolio__kpi-value">${yieldText}</div>
        <div class="finam-v2-portfolio__kpi-note">средневзвешенная годовая</div>
      </div>
      <div class="finam-v2-portfolio__kpi-item">
        <div class="finam-v2-portfolio__kpi-label">Риск-профиль</div>
        <div class="finam-v2-portfolio__kpi-value">${escapeHtml(p.riskProfile || 'По анкете')}</div>
        <div class="finam-v2-portfolio__kpi-note">по целям с портфелем</div>
      </div>
    </section>`;
}

function portfolioProjectionPoints(model) {
    const byMonth = new Map();
    (Array.isArray(model?.goals) ? model.goals : []).forEach((goal) => {
        const schedule = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
        schedule.forEach((row) => {
            const date = normalizeDate(row?.date);
            const value = maybeFinite(row?.total_capital ?? row?.capital ?? row?.balance);
            if (!date || value == null || value < 0) return;
            const key = toMonthKey(date);
            const current = byMonth.get(key) || { date: new Date(date.getFullYear(), date.getMonth(), 1), total: 0 };
            current.total += value;
            byMonth.set(key, current);
        });
    });
    const actual = [...byMonth.values()].sort((a, b) => a.date - b.date);
    if (actual.length > 1) return actual;

    const p = model?.portfolio || {};
    const months = Math.max(1, Math.round(finite(p.horizonMonths, 120)));
    const steps = 6;
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const initial = finite(p.initialTotal, 0);
    const final = finite(p.projectedTotal, initial + finite(p.monthlyTotal, 0) * months);
    const generated = [];
    for (let i = 0; i < steps; i += 1) {
        const t = i / Math.max(1, steps - 1);
        generated.push({
            date: addMonths(start, Math.round(months * t)),
            total: initial + (final - initial) * t,
        });
    }
    return generated;
}

function portfolioAxisLabel(value) {
    const n = finite(value, 0);
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}м`;
    if (Math.abs(n) >= 1000) return `${Math.round(n / 1000).toLocaleString('ru-RU')}к`;
    return Math.round(n).toLocaleString('ru-RU');
}

function buildPortfolioProjectionSvg(model) {
    const points = portfolioProjectionPoints(model);
    const plot = { left: 38, right: 486, top: 20, bottom: 120 };
    const maxValue = Math.max(...points.map((p) => finite(p.total, 0)), finite(model?.portfolio?.projectedTotal, 0), 1);
    const yFor = (value) => plot.bottom - (Math.max(0, finite(value, 0)) / maxValue) * (plot.bottom - plot.top);
    const xFor = (idx) => plot.left + (idx / Math.max(1, points.length - 1)) * (plot.right - plot.left);
    const coords = points.map((point, idx) => `${xFor(idx).toFixed(1)},${yFor(point.total).toFixed(1)}`).join(' ');
    const area = `${coords} ${plot.right},${plot.bottom} ${plot.left},${plot.bottom}`;
    const sample = sampleIndexes(points.length, 4);
    const gridValues = [0, maxValue / 3, (maxValue * 2) / 3, maxValue];
    return `<svg class="finam-v2-portfolio__chart" viewBox="0 0 500 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="finamV2PortfolioChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1e6bb8" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="#1e6bb8" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        ${gridValues.map((value) => {
        const y = yFor(value).toFixed(1);
        return `<line x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/><text x="32" y="${Number(y) + 3}" font-size="8" fill="#64748b" text-anchor="end">${escapeHtml(portfolioAxisLabel(value))}</text>`;
    }).join('\n        ')}
        <polygon points="${area}" fill="url(#finamV2PortfolioChartGrad)"/>
        <polyline points="${coords}" fill="none" stroke="#1e6bb8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${sample.map((idx) => `<text x="${xFor(idx).toFixed(1)}" y="140" font-size="8" fill="#64748b" text-anchor="${idx === points.length - 1 ? 'end' : idx === 0 ? 'middle' : 'middle'}">${escapeHtml(idx === 0 ? 'сейчас' : String(points[idx].date.getFullYear()))}</text>`).join('\n        ')}
      </svg>`;
}

function portfolioLadderHtml(model, helpers) {
    const buckets = Array.isArray(model?.portfolio?.liquidityBuckets) ? model.portfolio.liquidityBuckets : [];
    const icons = [
        '<path d="M12 3l7 3v5c0 4-2.7 7.7-7 10-4.3-2.3-7-6-7-10V6l7-3z" stroke="currentColor" stroke-width="1.5"/>',
        '<path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
        '<path d="M4 19h16M6 16l4-5 3 3 5-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    ];
    return `<div class="finam-v2-portfolio__ladder">
          ${buckets.slice(0, 3).map((bucket, idx) => `<div class="finam-v2-portfolio__ladder-row">
            <div class="finam-v2-portfolio__round-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${icons[idx] || icons[0]}</svg>
            </div>
            <div>
              <div class="finam-v2-portfolio__row-title">${escapeHtml(bucket.name || 'Контур')}</div>
              <div class="finam-v2-portfolio__row-sub">${escapeHtml(bucket.horizon || 'срок цели')}</div>
            </div>
            <div class="finam-v2-portfolio__row-value">${moneyHtml(helpers, bucket.value, { short: true })}</div>
          </div>`).join('\n          ')}
        </div>`;
}

function portfolioRiskHtml(model) {
    const p = model?.portfolio || {};
    const rows = normalizePortfolioRows(p.allocation, 0, 6);
    const shareBy = (re) => rows.filter((row) => re.test(String(row.label).toLowerCase())).reduce((sum, row) => sum + finite(row.percent, 0), 0);
    const market = Math.min(100, shareBy(/акци|фонд|stock|equity/));
    const liquidity = Math.min(100, shareBy(/депозит|накоп|сч[её]т|ликвид/));
    const insurance = Math.min(100, shareBy(/пдс|нпф|страх|нсж|исж/));
    const diversification = Math.min(100, rows.length * 18);
    const riskRows = [
        ['Рынок', market, market >= 45 ? 'выс.' : market >= 20 ? 'средн.' : 'низк.'],
        ['Ликвидность', liquidity, liquidity >= 20 ? 'хорош.' : 'контр.'],
        ['Защита', insurance, insurance > 0 ? 'есть' : 'нет'],
        ['Диверсиф.', diversification, rows.length >= 4 ? 'шир.' : 'узк.'],
    ];
    return `<div class="finam-v2-portfolio__risk">
          <div class="finam-v2-portfolio__risk-score">
            <strong>${formatPercentHtml(p.expectedReturn)}</strong>
            <span>средневзвешенная доходность</span>
          </div>
          <div class="finam-v2-portfolio__risk-bars">
            ${riskRows.map(([label, width, text]) => `<div class="finam-v2-portfolio__risk-row">
              <span>${escapeHtml(label)}</span>
              <div class="finam-v2-portfolio__risk-track"><div class="finam-v2-portfolio__risk-fill" style="width: ${Math.max(4, width)}%;"></div></div>
              <strong>${escapeHtml(text)}</strong>
            </div>`).join('\n            ')}
          </div>
        </div>`;
}

function portfolioObjectiveMapHtml(model) {
    const rows = Array.isArray(model?.portfolio?.objectiveMapping) ? model.portfolio.objectiveMapping : [];
    return `<table class="finam-v2-portfolio__map">
          <tbody>
            ${rows.slice(0, 4).map((row) => `<tr>
              <td>${escapeHtml(row.title || 'Цель')}</td>
              <td>${escapeHtml(row.text || 'связь с портфелем будет рассчитана')}</td>
            </tr>`).join('\n            ') || '<tr><td>Цели</td><td>будут показаны после расчёта</td></tr>'}
          </tbody>
        </table>`;
}

function portfolioPrinciplesHtml(model) {
    const principles = Array.isArray(model?.portfolio?.principles) ? model.portfolio.principles : [];
    return `<section class="finam-v2-portfolio__principles">
      ${principles.slice(0, 4).map((item, idx) => `<div class="finam-v2-portfolio__principle">
        <div class="finam-v2-portfolio__principle-num">${String(idx + 1).padStart(2, '0')}</div>
        <div class="finam-v2-portfolio__principle-title">${escapeHtml(item.title || 'Принцип')}</div>
        <p class="finam-v2-portfolio__principle-text">${escapeHtml(item.text || '')}</p>
      </div>`).join('\n      ')}
    </section>`;
}

function buildPortfolioSummaryArticleOne(model, helpers) {
    const p = model?.portfolio || {};
    const initialRows = normalizePortfolioRows(p.initialAllocation, p.initialTotal, 5);
    const monthlyRows = normalizePortfolioRows(p.monthlyAllocation, p.monthlyTotal, 5);
    const allocationRowsForTable = normalizePortfolioRows(p.allocation && p.allocation.length ? p.allocation : p.initialAllocation, p.initialTotal, 6);
    return `<article class="finam-v2-page">
    <header class="finam-v2-portfolio__header">
      <div class="finam-v2-portfolio__header-left">
        <span class="finam-v2-portfolio__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-portfolio__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-portfolio__pill">Итоговый портфель · 1/2</span>
    </header>
    <hr class="finam-v2-portfolio__rule" />

    <p class="finam-v2-portfolio__eyebrow">Сводка по портфелю</p>
    <h1 class="finam-v2-portfolio__headline">Итоговый портфель: ${moneyHtml(helpers, p.projectedTotal, { short: true })} по всем целям</h1>
    <p class="finam-v2-portfolio__lead">
      Страница собрана из расчёта PFP: стартовый капитал, ежемесячные пополнения, срок плана и средневзвешенная доходность берутся из консолидированного портфеля клиента.
    </p>

    ${portfolioKpiHtml(model, helpers)}

    <section class="finam-v2-portfolio__main">
      <div class="finam-v2-portfolio__donut-stack">
        ${portfolioDonutHtml({
        title: 'Первоначальный капитал',
        sub: 'Куда размещается капитал сейчас',
        centerValue: formatShortMoneyNoCurrency(helpers, p.initialTotal),
        centerSub: 'старт',
        rows: initialRows,
    })}
        ${portfolioDonutHtml({
        title: 'Ежемесячное пополнение',
        sub: 'Куда идёт новый взнос',
        centerValue: formatShortMoneyNoCurrency(helpers, p.monthlyTotal),
        centerSub: 'в месяц',
        rows: monthlyRows,
        monthly: true,
    })}
      </div>
      <div class="finam-v2-portfolio__table-card">
        <p class="finam-v2-portfolio__section-kicker">Роль классов активов</p>
        ${portfolioAllocationTableHtml(allocationRowsForTable, helpers)}
      </div>
    </section>

    <section class="finam-v2-portfolio__why">
      <div class="finam-v2-portfolio__card">
        <div class="finam-v2-portfolio__card-title">Портфель из расчёта</div>
        <p class="finam-v2-portfolio__card-text">Аллокации стартового капитала и пополнений подтягиваются из consolidated_portfolio.</p>
      </div>
      <div class="finam-v2-portfolio__card">
        <div class="finam-v2-portfolio__card-title">Сроки связаны с целями</div>
        <p class="finam-v2-portfolio__card-text">Горизонт берётся как максимальный срок среди целей клиента.</p>
      </div>
      <div class="finam-v2-portfolio__card">
        <div class="finam-v2-portfolio__card-title">Доходность взвешена</div>
        <p class="finam-v2-portfolio__card-text">Ставка считается по долям инструментов, а не как декоративная константа.</p>
      </div>
    </section>

    <section class="finam-v2-portfolio__panel finam-v2-portfolio__projection">
      <div class="finam-v2-portfolio__projection-head">
        <p class="finam-v2-portfolio__section-kicker">Прогноз капитала</p>
        <span class="finam-v2-portfolio__projection-note">база ${formatPercentHtml(p.expectedReturn)} годовых · горизонт ${escapeHtml(p.horizonLabel || '—')}</span>
      </div>
      ${buildPortfolioProjectionSvg(model)}
    </section>

    <div class="finam-v2-portfolio__grow"></div>
    <hr class="finam-v2-portfolio__footer-rule" />
    <footer class="finam-v2-portfolio__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-portfolio__footer-right">Итоговый портфель агрегирует инвестиционные цели клиента</span>
    </footer>
  </article>`;
}

function buildPortfolioSummaryArticleTwo(model, helpers) {
    const p = model?.portfolio || {};
    return `<article class="finam-v2-page">
    <header class="finam-v2-portfolio__header">
      <div class="finam-v2-portfolio__header-left">
        <span class="finam-v2-portfolio__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-portfolio__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-portfolio__pill">Итоговый портфель · 2/2</span>
    </header>
    <hr class="finam-v2-portfolio__rule" />

    <p class="finam-v2-portfolio__eyebrow">Операционная логика портфеля</p>
    <h1 class="finam-v2-portfolio__headline">Как портфель обслуживает реальные цели клиента</h1>
    <p class="finam-v2-portfolio__lead">
      Второй лист раскладывает расчёт на операционные правила: где нужна ликвидность, как идёт пополнение, какие риски контролируются и какие цели поддерживает портфель.
    </p>

    <section class="finam-v2-portfolio__grid-2">
      <div class="finam-v2-portfolio__panel">
        <div class="finam-v2-portfolio__panel-head">
          <p class="finam-v2-portfolio__section-kicker">Лестница ликвидности</p>
          <span class="finam-v2-portfolio__panel-note">по срокам целей</span>
        </div>
        ${portfolioLadderHtml(model, helpers)}
      </div>

      <div class="finam-v2-portfolio__panel">
        <div class="finam-v2-portfolio__panel-head">
          <p class="finam-v2-portfolio__section-kicker">Поток пополнений</p>
          <span class="finam-v2-portfolio__panel-note">${moneyHtml(helpers, p.monthlyTotal, { short: true })}/мес</span>
        </div>
        <div class="finam-v2-portfolio__flow">
          <div class="finam-v2-portfolio__flow-step">
            <div class="finam-v2-portfolio__flow-title">Доход</div>
            <div class="finam-v2-portfolio__flow-sub">свободный поток</div>
          </div>
          <div class="finam-v2-portfolio__arrow">→</div>
          <div class="finam-v2-portfolio__flow-step">
            <div class="finam-v2-portfolio__flow-title">Пополнение</div>
            <div class="finam-v2-portfolio__flow-sub">${escapeHtml(p.monthlyAllocation?.length || 0)} инструментов</div>
          </div>
          <div class="finam-v2-portfolio__arrow">→</div>
          <div class="finam-v2-portfolio__flow-step">
            <div class="finam-v2-portfolio__flow-title">Цели</div>
            <div class="finam-v2-portfolio__flow-sub">${escapeHtml((model?.goals || []).length)} в плане</div>
          </div>
        </div>
        <div class="finam-v2-portfolio__insight" style="margin: 11px 0 0;">
          <strong>Правило:</strong> новый взнос распределяется по расчётной структуре портфеля и сверяется с целями при пересчёте.
        </div>
      </div>
    </section>

    <section class="finam-v2-portfolio__grid-2">
      <div class="finam-v2-portfolio__panel">
        <div class="finam-v2-portfolio__panel-head">
          <p class="finam-v2-portfolio__section-kicker">Риск-контур</p>
          <span class="finam-v2-portfolio__panel-note">${escapeHtml(p.riskProfile || 'по анкете')}</span>
        </div>
        ${portfolioRiskHtml(model)}
      </div>

      <div class="finam-v2-portfolio__panel">
        <div class="finam-v2-portfolio__panel-head">
          <p class="finam-v2-portfolio__section-kicker">Связь с целями</p>
          <span class="finam-v2-portfolio__panel-note">капитал и сроки</span>
        </div>
        ${portfolioObjectiveMapHtml(model)}
      </div>
    </section>

    ${portfolioPrinciplesHtml(model)}

    <div class="finam-v2-portfolio__insight">
      <strong>Итог:</strong> расчётный портфель ведёт к капиталу ${moneyHtml(helpers, p.projectedTotal, { short: true })} на горизонте ${escapeHtml(p.horizonLabel || '—')}; доходность портфеля — ${formatPercentHtml(p.expectedReturn)} годовых.
    </div>

    <div class="finam-v2-portfolio__grow"></div>
    <hr class="finam-v2-portfolio__footer-rule" />
    <footer class="finam-v2-portfolio__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-portfolio__footer-right">Не является индивидуальной инвестиционной рекомендацией</span>
    </footer>
  </article>`;
}

function replacePortfolioSummaryPage(html, { model, helpers }) {
    return replaceFinamV2PageArticles(html, (article, index) => {
        const pageIndex = /Итоговый портфель\s*·\s*2\/2/.test(article) ? 1 : index;
        return pageIndex === 1
            ? buildPortfolioSummaryArticleTwo(model, helpers)
            : buildPortfolioSummaryArticleOne(model, helpers);
    });
}

function tailPageHeader(pillText) {
    return `<header class="finam-v2-wow__header">
      <div class="finam-v2-wow__header-left">
        <span class="finam-v2-wow__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-wow__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-wow__pill">${escapeHtml(pillText)}</span>
    </header>
    <hr class="finam-v2-wow__rule" />`;
}

function tailFooter(rightText) {
    return `<hr class="finam-v2-wow__footer-rule" />
    <footer class="finam-v2-wow__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-wow__footer-right">${escapeHtml(rightText)}</span>
    </footer>`;
}

function firstBenefitYear(tax) {
    const years = [];
    ['pds_benefits', 'iis_benefits', 'nsj_benefits', 'children_benefits', 'totals'].forEach((key) => {
        Object.keys(tax?.[key] || {}).forEach((field) => {
            const match = String(field).match(/_(20\d{2})$/);
            if (match && finite(tax[key][field], 0) > 0) years.push(Number(match[1]));
        });
    });
    return years.length ? Math.min(...years) : new Date().getFullYear() + 1;
}

function taxSourceRows(tax) {
    const year = firstBenefitYear(tax);
    const cats = [
        { key: 'pds_benefits', label: 'ПДС', role: 'Пенсия' },
        { key: 'iis_benefits', label: 'ИИС', role: 'Рост' },
        { key: 'nsj_benefits', label: 'НСЖ', role: 'Защита' },
        { key: 'children_benefits', label: 'Детские вычеты', role: 'Семья' },
    ];
    const rows = cats.map((cat) => {
        const bucket = tax?.[cat.key] || {};
        return {
            ...cat,
            year,
            yearAmount: finite(bucket[`deduction_${year}`], 0),
            periodAmount: finite(bucket.total_deductions, 0),
        };
    }).filter((row) => row.yearAmount > 0 || row.periodAmount > 0);
    const periodBase = rows.reduce((sum, row) => sum + row.periodAmount, 0) || rows.reduce((sum, row) => sum + row.yearAmount, 0);
    return {
        year,
        rows: rows.map((row) => ({
            ...row,
            percent: periodBase > 0 ? (Math.max(row.periodAmount, row.yearAmount) / periodBase) * 100 : 0,
        })),
    };
}

function taxSummary(model) {
    const tax = model?.taxBenefits || {};
    const totals = tax.totals || {};
    const { year, rows } = taxSourceRows(tax);
    const deductionYear = finite(totals[`deduction_${year}`], rows.reduce((sum, row) => sum + row.yearAmount, 0));
    const cofinYear = finite(totals[`cofinancing_${year}`], finite(tax?.pds_benefits?.[`cofinancing_${year}`], 0));
    const totalDeductions = finite(totals.total_deductions, rows.reduce((sum, row) => sum + row.periodAmount, 0));
    const totalCofinancing = finite(totals.total_cofinancing, 0);
    const totalStateBenefits = finite(totals.total_state_benefits, totalDeductions + totalCofinancing);
    const projected = finite(model?.portfolio?.projectedTotal, 0);
    const capitalizedBenefits = totalCofinancing;
    const withoutBenefits = Math.max(0, projected - capitalizedBenefits);
    return {
        year,
        rows,
        deductionYear,
        cofinYear,
        totalDeductions,
        totalCofinancing,
        totalStateBenefits,
        capitalizedBenefits,
        projected,
        withoutBenefits,
    };
}

function buildTaxRowsHtml(summary, helpers) {
    const bodyRows = summary.rows.map((row) => `<tr>
              <td><span class="finam-v2-tax__source">${escapeHtml(row.label)}</span></td>
              <td>
                <span class="finam-v2-tax__num">${formatPercentHtml(row.percent)}</span>
                <div class="finam-v2-tax__bar"><div class="finam-v2-tax__bar-fill" style="width: ${Math.max(0, Math.min(100, row.percent)).toFixed(1)}%;"></div></div>
              </td>
              <td class="finam-v2-tax__num">${moneyHtml(helpers, row.yearAmount, { short: true })}</td>
              <td class="finam-v2-tax__num">${moneyHtml(helpers, row.periodAmount, { short: true })}</td>
              <td class="finam-v2-tax__role">${escapeHtml(row.role)}</td>
            </tr>`);
    if (!bodyRows.length) {
        bodyRows.push('<tr><td colspan="5">По расчёту нет доступных налоговых льгот для отображения.</td></tr>');
    }
    bodyRows.push(`<tr>
              <td><strong>Итого</strong></td>
              <td class="finam-v2-tax__num">${summary.rows.length ? '100%' : '0%'}</td>
              <td class="finam-v2-tax__num">${moneyHtml(helpers, summary.deductionYear, { short: true })}</td>
              <td class="finam-v2-tax__num">${moneyHtml(helpers, summary.totalDeductions, { short: true })}</td>
              <td></td>
            </tr>`);
    return bodyRows.join('\n');
}

function taxProjectionSvg(summary, helpers) {
    const finalWith = Math.max(summary.projected, 1);
    const finalWithout = Math.max(summary.withoutBenefits, 0);
    const max = Math.max(finalWith, finalWithout, 1);
    const x0 = 28;
    const x1 = 314;
    const y0 = 92;
    const y1 = 18;
    const steps = 8;
    const points = (final) => Array.from({ length: steps + 1 }, (_, idx) => {
        const t = idx / steps;
        const x = x0 + (x1 - x0) * t;
        const value = final * (0.08 + 0.92 * Math.pow(t, 1.25));
        const y = y0 - (value / max) * (y0 - y1);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="finam-v2-tax__chart" viewBox="0 0 330 112" role="img" aria-label="Прогноз капитала с учетом софинансирования">
          <line x1="28" y1="92" x2="314" y2="92" stroke="#cbd5e1" stroke-width="1" />
          <line x1="28" y1="18" x2="28" y2="92" stroke="#cbd5e1" stroke-width="1" />
          <line x1="28" y1="74" x2="314" y2="74" stroke="#eef2f7" stroke-width="1" />
          <line x1="28" y1="54" x2="314" y2="54" stroke="#eef2f7" stroke-width="1" />
          <line x1="28" y1="34" x2="314" y2="34" stroke="#eef2f7" stroke-width="1" />
          <polyline points="${points(finalWith)}" fill="none" stroke="#002a4a" stroke-width="2.4" />
          <polyline points="${points(finalWithout)}" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="4 4" />
          <circle cx="314" cy="${(y0 - (finalWith / max) * (y0 - y1)).toFixed(1)}" r="3" fill="#002a4a" />
          <circle cx="314" cy="${(y0 - (finalWithout / max) * (y0 - y1)).toFixed(1)}" r="3" fill="#94a3b8" />
          <text x="31" y="105" class="finam-v2-tax__axis">сейчас</text>
          <text x="154" y="105" class="finam-v2-tax__axis">середина</text>
          <text x="286" y="105" class="finam-v2-tax__axis">срок</text>
          <text x="198" y="22" class="finam-v2-tax__chart-value">${moneyHtml(helpers, finalWith, { short: true })}</text>
          <text x="198" y="43" class="finam-v2-tax__chart-label">${moneyHtml(helpers, finalWithout, { short: true })} без софинансирования</text>
        </svg>`;
}

function buildTaxPlanningArticle(model, helpers) {
    const s = taxSummary(model);
    const availableLabels = s.rows.map((row) => row.label).join(' · ') || 'льготы не выявлены';
    const horizon = model?.portfolio?.horizonLabel || maxGoalYears(model?.goals);
    return `<article class="finam-v2-page">
    <header class="finam-v2-tax__header">
      <div class="finam-v2-tax__header-left">
        <span class="finam-v2-tax__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-tax__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-tax__pill">Налоги и софинансирование</span>
    </header>
    <hr class="finam-v2-tax__rule" />

    <section class="finam-v2-tax__hero">
      <div>
        <p class="finam-v2-tax__eyebrow">Налоговое планирование</p>
        <h1 class="finam-v2-tax__headline">Льготы усиливают план, если подтверждены документами</h1>
        <p class="finam-v2-tax__lead">Страница собрана из расчёта PFP: НДФЛ, ПДС, ИИС, НСЖ и детские вычеты показываются только как модельный эффект финансового плана.</p>
      </div>
      <aside class="finam-v2-tax__profile">
        <div class="finam-v2-tax__profile-row"><span class="finam-v2-tax__profile-icon">%</span><div><div class="finam-v2-tax__profile-label">Налоговый период</div><div class="finam-v2-tax__profile-value">${escapeHtml(s.year)} год</div></div></div>
        <div class="finam-v2-tax__profile-row"><span class="finam-v2-tax__profile-icon">T</span><div><div class="finam-v2-tax__profile-label">Горизонт оптимизации</div><div class="finam-v2-tax__profile-value">${escapeHtml(horizon)}</div></div></div>
        <div class="finam-v2-tax__profile-row"><span class="finam-v2-tax__profile-icon">✓</span><div><div class="finam-v2-tax__profile-label">Доступные льготы</div><div class="finam-v2-tax__profile-value">${escapeHtml(availableLabels)}</div></div></div>
        <div class="finam-v2-tax__profile-row"><span class="finam-v2-tax__profile-icon">+</span><div><div class="finam-v2-tax__profile-label">Софинансирование</div><div class="finam-v2-tax__profile-value">${moneyHtml(helpers, s.totalCofinancing, { short: true })}</div></div></div>
      </aside>
    </section>

    <section class="finam-v2-tax__kpis" aria-label="Ключевые налоговые показатели">
      <div class="finam-v2-tax__kpi"><div class="finam-v2-tax__kpi-label">Возврат НДФЛ за год</div><div class="finam-v2-tax__kpi-value">${moneyHtml(helpers, s.deductionYear, { short: true })}</div></div>
      <div class="finam-v2-tax__kpi"><div class="finam-v2-tax__kpi-label">Возврат НДФЛ за весь срок</div><div class="finam-v2-tax__kpi-value">${moneyHtml(helpers, s.totalDeductions, { short: true })}</div></div>
      <div class="finam-v2-tax__kpi"><div class="finam-v2-tax__kpi-label">Льготы и софинансирование</div><div class="finam-v2-tax__kpi-value">${moneyHtml(helpers, s.totalStateBenefits, { short: true })}</div></div>
    </section>

    <section class="finam-v2-tax__main">
      <div class="finam-v2-tax__table-card">
        <div class="finam-v2-tax__table-title">Структура налоговых льгот</div>
        <table class="finam-v2-tax__table" aria-label="Структура налоговых льгот">
          <thead><tr><th style="width: 38%;">Источник</th><th style="width: 16%;">Доля</th><th style="width: 18%;">Год</th><th style="width: 18%;">Период</th><th style="width: 10%;">Роль</th></tr></thead>
          <tbody>${buildTaxRowsHtml(s, helpers)}</tbody>
        </table>
      </div>
      <aside class="finam-v2-tax__side" aria-label="Почему работает налоговая структура">
        <section class="finam-v2-tax__insight-card"><div class="finam-v2-tax__side-title">Годовой возврат НДФЛ</div><p class="finam-v2-tax__side-text">Показываем оценку на ближайший налоговый период по расчёту, без обещания фактического возврата.</p></section>
        <section class="finam-v2-tax__insight-card"><div class="finam-v2-tax__side-title">Гос. софинансирование</div><p class="finam-v2-tax__side-text">Софинансирование учитывается отдельно от НДФЛ и зависит от правил программы.</p></section>
        <section class="finam-v2-tax__insight-card"><div class="finam-v2-tax__side-title">Документы и сроки</div><p class="finam-v2-tax__side-text">Эффект сохраняется только при корректных документах и соблюдении сроков подачи.</p></section>
      </aside>
    </section>

    <section class="finam-v2-tax__bottom">
      <div class="finam-v2-tax__chart-card">
        <div class="finam-v2-tax__chart-head"><div class="finam-v2-tax__chart-title">Эффект капитала от софинансирования</div><p class="finam-v2-tax__chart-note">Капитал сравнивается с ПДС-софинансированием и без него; вычеты показаны отдельно как налоговый эффект.</p></div>
        ${taxProjectionSvg(s, helpers)}
      </div>
      <aside class="finam-v2-tax__compliance-card">
        <div class="finam-v2-tax__side-title">Что проверить перед подачей</div>
        <div class="finam-v2-tax__compliance-list">
          <div class="finam-v2-tax__compliance-row"><span>Статус продукта</span><span class="finam-v2-tax__compliance-value">Проверить</span></div>
          <div class="finam-v2-tax__compliance-row"><span>Лимиты вычетов</span><span class="finam-v2-tax__compliance-value">По НК РФ</span></div>
          <div class="finam-v2-tax__compliance-row"><span>Документы</span><span class="finam-v2-tax__compliance-value">Нужны</span></div>
          <div class="finam-v2-tax__compliance-row"><span>Консультация</span><span class="finam-v2-tax__compliance-value">Желательна</span></div>
        </div>
      </aside>
    </section>

    <p class="finam-v2-tax__disclaimer"><strong>Важно:</strong> расчёт налогового эффекта является модельной оценкой на базе параметров финансового плана. Он не заменяет индивидуальную налоговую консультацию и требует проверки документов перед подачей.</p>
    <hr class="finam-v2-tax__footer-rule" />
    <footer class="finam-v2-tax__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-tax__footer-right">Налоговая стратегия показывает оценочный эффект льгот и не является налоговой консультацией</span>
    </footer>
  </article>`;
}

function replaceTaxPlanningPage(html, context) {
    return replaceFinamV2PageArticles(html, () => buildTaxPlanningArticle(context.model, context.helpers));
}

function isLifeGoal(goal) {
    return String(goal?.goal_type || '').toUpperCase() === 'LIFE' || Number(goal?.goal_type_id) === 5;
}

function scheduleRows(goal) {
    return Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
}

function sameMonth(dateA, dateB) {
    return dateA && dateB && dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth();
}

function isInitialScheduleRow(row) {
    return String(row?.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP';
}

function rowCapitalValue(row) {
    return maybeFinite(row?.total_capital ?? row?.capital ?? row?.balance);
}

function capitalForGoalAtMonth(goal, month) {
    const rows = scheduleRows(goal)
        .map((row) => ({ row, date: normalizeDate(row?.date) }))
        .filter((item) => item.date)
        .sort((a, b) => a.date - b.date);
    let latest = null;
    rows.forEach((item) => {
        if (item.date <= month) latest = item.row;
    });
    const exact = rows.find((item) => sameMonth(item.date, month))?.row;
    const value = rowCapitalValue(exact || latest);
    return value == null ? finite(goalInitial(goal), 0) : value;
}

function buildDetailedPlanRows(model) {
    const goals = (Array.isArray(model?.goals) ? model.goals : []).filter((goal) => !isLifeGoal(goal));
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const latestDate = goals.flatMap((goal) => scheduleRows(goal).map((row) => normalizeDate(row?.date)).filter(Boolean))
        .sort((a, b) => b - a)[0];
    const availableMonths = latestDate ? Math.max(1, (latestDate.getFullYear() - start.getFullYear()) * 12 + latestDate.getMonth() - start.getMonth() + 1) : 24;
    const monthsToShow = Math.min(Math.max(availableMonths, 1), 26);
    const initialTotal = goals.reduce((sum, goal) => sum + finite(goalInitial(goal), 0), 0);
    return Array.from({ length: monthsToShow }, (_, idx) => {
        const month = addMonths(start, idx);
        let replenishment = idx === 0 ? initialTotal : 0;
        let tax = 0;
        let cofinancing = 0;
        let capital = 0;
        goals.forEach((goal) => {
            scheduleRows(goal).forEach((row) => {
                const date = normalizeDate(row?.date);
                if (!sameMonth(date, month)) return;
                if (idx > 0 && !isInitialScheduleRow(row)) replenishment += finite(row?.replenishment, 0);
                tax += finite(row?.tax_deduction, 0);
                cofinancing += finite(row?.cofinancing, 0);
            });
            capital += capitalForGoalAtMonth(goal, month);
        });
        return { month, replenishment, tax, cofinancing, capital };
    }).filter((row, idx) => idx === 0 || row.replenishment > 0 || row.tax > 0 || row.cofinancing > 0 || row.capital > 0);
}

function detailedRowHtml(row, helpers) {
    return `<tr><td>${escapeHtml(`${MONTH_SHORT_RU[row.month.getMonth()]} ${row.month.getFullYear()}`)}</td><td class="finam-v2-tail__num">${moneyHtml(helpers, row.replenishment)}</td><td class="finam-v2-tail__num">${moneyHtml(helpers, row.tax)}</td><td class="finam-v2-tail__num">${moneyHtml(helpers, row.cofinancing)}</td><td class="finam-v2-tail__num">${moneyHtml(helpers, row.capital)}</td></tr>`;
}

function detailedTableHtml(rows, helpers, label) {
    return `<table class="finam-v2-tail__table" aria-label="${escapeAttr(label)}">
      <thead><tr><th style="width: 17%;">Дата</th><th style="width: 21%;">Пополнение</th><th style="width: 20%;">Налоговый вычет</th><th style="width: 20%;">Софинансирование</th><th style="width: 22%;">Итоговый капитал</th></tr></thead>
      <tbody>${rows.map((row) => detailedRowHtml(row, helpers)).join('\n        ') || '<tr><td colspan="5">Расчётный график пополнений отсутствует.</td></tr>'}</tbody>
    </table>`;
}

function buildDetailedPlanArticle(model, helpers, pageIndex) {
    const rows = buildDetailedPlanRows(model);
    const firstRows = rows.slice(0, 12);
    const secondRows = rows.slice(12, 26);
    const currentRows = pageIndex === 1 ? secondRows : firstRows;
    const totalInitial = firstRows[0]?.replenishment || 0;
    const monthly = (Array.isArray(model?.goals) ? model.goals : [])
        .filter((goal) => !isLifeGoal(goal))
        .reduce((sum, goal) => sum + finite(goalMonthly(goal), 0), 0);
    if (pageIndex === 1) {
        return `<article class="finam-v2-page">
    ${tailPageHeader('Подробный план · 2/2')}
    ${detailedTableHtml(currentRows, helpers, 'Подробный план пополнений, продолжение')}
    <div class="finam-v2-tail__page-note"></div>
    ${tailFooter('Продолжение календаря пополнений по всем целям без страхования жизни')}
  </article>`;
    }
    return `<article class="finam-v2-page">
    ${tailPageHeader('Подробный план · 1/2')}
    <section class="finam-v2-tail__hero">
      <div>
        <p class="finam-v2-wow__eyebrow">График пополнений</p>
        <h1 class="finam-v2-wow__headline">Таблица превращает стратегию в календарь действий</h1>
        <p class="finam-v2-wow__lead">Первый месяц — текущий: в пополнении показан стартовый капитал по всем целям, кроме страхования жизни. Следующие строки показывают регулярные пополнения, вычеты, софинансирование и капитал из расчёта.</p>
      </div>
      <aside class="finam-v2-tail__kpi-stack">
        <div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">${moneyHtml(helpers, totalInitial, { short: true })}</div><div class="finam-v2-tail__kpi-label">стартовый капитал в первом месяце</div></div>
        <div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">${moneyHtml(helpers, monthly, { short: true })}</div><div class="finam-v2-tail__kpi-label">регулярное пополнение в расчёте</div></div>
      </aside>
    </section>
    ${detailedTableHtml(currentRows, helpers, 'Подробный план пополнений')}
    <section class="finam-v2-wow__insight finam-v2-tail__page-note"><strong>Комментарий:</strong> таблица агрегирует календарь по всем накопительным и инвестиционным целям, без потока страхования жизни.</section>
    ${tailFooter('Таблица строится по календарю пополнений клиента')}
  </article>`;
}

function replaceDetailedPlanPage(html, context) {
    return replaceFinamV2PageArticles(html, (article, index) => {
        const pageIndex = /Подробный план\s*·\s*2\/2/.test(article) ? 1 : index;
        return buildDetailedPlanArticle(context.model, context.helpers, pageIndex);
    });
}

function displayNumber(value, fallback = '—') {
    const n = maybeFinite(value);
    return n == null ? fallback : n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function normalizeComonItems(model) {
    const showcase = model?.comonShowcase || {};
    const items = Array.isArray(showcase.items) ? showcase.items : Array.isArray(showcase.strategies) ? showcase.strategies : [];
    return items.slice(0, 6).map((item) => ({
        title: item.name || item.title || 'Стратегия Comon',
        desc: item.description || [item.author ? `Автор: ${item.author}` : null, item.risk_level ? `риск: ${item.risk_level}` : null].filter(Boolean).join(', ') || 'Параметры стратегии берутся из витрины Comon.',
        url: item.url || item.link || '',
        minSum: maybeFinite(item.min_sum ?? item.minSum),
        profit365: maybeFinite(item.profit_365_days_percent ?? item.profit365DaysPercent),
        avgProfit: maybeFinite(item.annual_average_profit_percent ?? item.annualAverageProfitPercent),
        followers: maybeFinite(item.follower_count ?? item.followers),
        rating: maybeFinite(item.strategy_rating ?? item.rating),
        tags: Array.isArray(item.tags) ? item.tags : [],
    }));
}

function comonCardHtml(item) {
    const yieldValue = item.profit365 ?? item.avgProfit;
    const link = item.url ? `<a class="finam-v2-tail__chip" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Смотреть</a>` : '';
    const meta = [
        item.minSum != null ? `Мин. вход: ${formatMoneyWith({}, item.minSum, { short: true })}` : null,
        yieldValue != null ? `${displayNumber(yieldValue)}% / 12 мес` : null,
        item.followers != null ? `${Math.round(item.followers).toLocaleString('ru-RU')} подписч.` : null,
        item.rating != null ? `рейтинг ${displayNumber(item.rating)}` : null,
    ].filter(Boolean);
    return `<article class="finam-v2-tail__product-card">
        <h2 class="finam-v2-tail__product-title">${escapeHtml(item.title)}</h2>
        <p class="finam-v2-tail__product-text">${escapeHtml(item.desc)}</p>
        <div class="finam-v2-tail__chip-row">
          ${meta.slice(0, 3).map((text, idx) => `<span class="finam-v2-tail__chip${idx === 1 ? ' finam-v2-tail__chip--accent' : ''}">${escapeHtml(text)}</span>`).join('\n          ')}
          ${link}
        </div>
      </article>`;
}

function buildComonArticle(model, pageIndex) {
    const items = normalizeComonItems(model);
    const chunk = pageIndex === 1 ? items.slice(3, 6) : items.slice(0, 3);
    const disclaimer = String(model?.comonShowcase?.disclaimer_ru || '').trim() ||
        'Историческая доходность стратегий Comon не гарантирует результат в будущем. Подключение стратегии требует отдельного клиентского решения и проверки документов.';
    if (pageIndex === 1) {
        return `<article class="finam-v2-page">
    ${tailPageHeader('Comon · 2/2')}
    <p class="finam-v2-wow__eyebrow">Продолжение подборки</p>
    <h1 class="finam-v2-wow__headline">Стратегии остаются инструментом, а не заменой финансового плана</h1>
    <p class="finam-v2-wow__lead">Карточки подставляются из витрины Comon. Перед подключением клиент отдельно сверяет риск, комиссии и документы.</p>
    <section class="finam-v2-tail__card-grid">${chunk.map(comonCardHtml).join('\n      ') || '<article class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Данные Comon</p><p class="finam-v2-tail__body-text">Дополнительные стратегии не переданы в расчёте.</p></article>'}</section>
    <section class="finam-v2-tail__card-grid finam-v2-tail__card-grid--3">
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">До подключения</p><p class="finam-v2-tail__body-text">Проверяем лимит риска, комиссии, минимальную сумму и ликвидность клиентского портфеля.</p></div>
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">После подключения</p><p class="finam-v2-tail__body-text">Фиксируем дату контроля, максимальную просадку и правило отключения стратегии.</p></div>
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">В отчёте</p><p class="finam-v2-tail__body-text">Показываем ссылку на стратегию и поясняем, что доходность историческая.</p></div>
    </section>
    <p class="finam-v2-tail__disclaimer finam-v2-tail__page-note">${escapeHtml(disclaimer)}</p>
    ${tailFooter('Информация не является индивидуальной инвестиционной рекомендацией')}
  </article>`;
    }
    return `<article class="finam-v2-page">
    ${tailPageHeader('Comon · 1/2')}
    <section class="finam-v2-tail__hero finam-v2-tail__hero--wide">
      <div><p class="finam-v2-wow__eyebrow">Автоследование Comon</p><h1 class="finam-v2-wow__headline">Стратегии, которые можно подключать как управляемый контур портфеля</h1><p class="finam-v2-wow__lead">Блок показывает витрину вариантов для отдельного инвестиционного решения: риск, минимальный вход, историческую доходность и ссылку на стратегию.</p></div>
      <aside class="finam-v2-tail__kpi-stack"><div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">${items.length}</div><div class="finam-v2-tail__kpi-label">стратегий в подборке</div></div><div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">12+ мес</div><div class="finam-v2-tail__kpi-label">разумный горизонт оценки</div></div></aside>
    </section>
    <section class="finam-v2-wow__insight"><strong>Как читаем блок:</strong> сначала сверяем риск-профиль, минимальный вход, комиссии и допустимую просадку. Только после этого стратегия может стать частью портфеля.</section>
    <p class="finam-v2-tail__section-title">Карточки для первичного отбора</p>
    <section class="finam-v2-tail__card-grid">${chunk.map(comonCardHtml).join('\n      ') || '<article class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Данные Comon</p><p class="finam-v2-tail__body-text">Витрина стратегий не передана в расчёте.</p></article>'}</section>
    <section class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Критерии отбора</p><ul class="finam-v2-tail__mini-list"><li>Сравниваем риск стратегии с риск-профилем клиента и горизонтом конкретной цели.</li><li>Смотрим минимальный вход и не забираем деньги из финансового резерва.</li><li>Разделяем историческую доходность и ожидаемый результат: прошлое не гарантирует будущее.</li></ul></section>
    ${tailFooter('Автоследование рассматривается после проверки риск-профиля')}
  </article>`;
}

function replaceComonAutofollowPage(html, context) {
    return replaceFinamV2PageArticles(html, (article, index) => {
        const pageIndex = /Comon\s*·\s*2\/2/.test(article) ? 1 : index;
        return buildComonArticle(context.model, pageIndex);
    });
}

const FINAM_V2_IDU_STRATEGIES = [
    { name: 'Валютная CNY', slug: 'currency-cny', yieldLabel: '10%', desc: 'Юаневые облигации эмитентов российского рынка.' },
    { name: 'Новая Синергия', slug: 'synergy-new', yieldLabel: '55%', desc: 'Диверсификация и алгоритмы; на сайте также «Синергия NEW».' },
    { name: 'M2 Всепогодная', slug: 'm2-all-weather', yieldLabel: '30%', desc: 'Облигации, акции, ОФЗ и алгоритмическая торговля фьючерсами.' },
    { name: 'Алготраст', slug: 'algotrust', yieldLabel: '30%', desc: 'Автоматизированная торговля ликвидными фьючерсами Московской биржи.' },
    { name: 'Ключевая ставка', slug: 'key-rate', yieldLabel: '45%', desc: 'ОФЗ и сценарии вокруг ключевой ставки Центрального банка.' },
    { name: 'Валютный депозит', slug: 'currency-deposit', yieldLabel: '20%', desc: 'Инвалютные инструменты и выплаты по курсу ЦБ.' },
    { name: 'Инвестиционный прирост', slug: 'investment-growth', yieldLabel: '18%', desc: 'Подход PAA: акции, облигации и денежный рынок РФ.' },
    { name: 'Облигационная Максимум', slug: 'bond-maximum', yieldLabel: '20%', desc: 'Российские облигации и реинвестирование купонов.' },
    { name: 'Авторская стратегия Юлии Афанасьевой', slug: null, yieldLabel: '33%', desc: 'Российские акции и облигации; актуальные параметры сверяются с витриной ДУ.' },
];

function iduCardHtml(item) {
    const url = item.slug ? `https://funds.finam.ru/idu/${item.slug}/` : 'https://funds.finam.ru/';
    return `<article class="finam-v2-tail__product-card">
        <h2 class="finam-v2-tail__product-title">${escapeHtml(item.name)}</h2>
        <p class="finam-v2-tail__product-text">${escapeHtml(item.desc)}</p>
        <div class="finam-v2-tail__chip-row"><span class="finam-v2-tail__chip finam-v2-tail__chip--accent">Ожид. доходность: ${escapeHtml(item.yieldLabel)}</span><a class="finam-v2-tail__chip" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Подробнее</a></div>
      </article>`;
}

function buildIduArticle(pageIndex) {
    const chunk = pageIndex === 1 ? FINAM_V2_IDU_STRATEGIES.slice(5) : FINAM_V2_IDU_STRATEGIES.slice(0, 5);
    if (pageIndex === 1) {
        return `<article class="finam-v2-page">
    ${tailPageHeader('ДУ · 2/2')}
    <p class="finam-v2-wow__eyebrow">Продолжение витрины</p>
    <h1 class="finam-v2-wow__headline">ДУ выбирается под задачу капитала, а не по самой крупной цифре доходности</h1>
    <p class="finam-v2-wow__lead">Для v2 показываем роль стратегии, риск, горизонт, валюту и ограничение по доле в портфеле.</p>
    <section class="finam-v2-tail__card-grid">${chunk.map(iduCardHtml).join('\n      ')}
      <article class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Контроль доли</p><p class="finam-v2-tail__body-text">ДУ не должно съедать резерв и короткие цели. Доля ограничивается горизонтом и готовностью клиента к просадке.</p></article>
      <article class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Следующий шаг</p><p class="finam-v2-tail__body-text">После выбора кандидатов менеджер сверяет актуальные условия на сайте Финам Фонды и оформляет решение отдельно.</p></article>
    </section>
    <p class="finam-v2-tail__disclaimer finam-v2-tail__page-note">Ожидаемая доходность, минимальные суммы и описания стратегий являются ориентиром витрины. Они не заменяют договор, регламент доверительного управления и проверку актуальных условий.</p>
    ${tailFooter('Информация не является индивидуальной инвестиционной рекомендацией')}
  </article>`;
    }
    return `<article class="finam-v2-page">
    ${tailPageHeader('ДУ · 1/2')}
    <section class="finam-v2-tail__hero finam-v2-tail__hero--wide">
      <div><p class="finam-v2-wow__eyebrow">Доверительное управление</p><h1 class="finam-v2-wow__headline">Стратегии Финам Фонды как отдельный управляемый слой капитала</h1><p class="finam-v2-wow__lead">Блок ДУ показывает витрину решений, где управление портфелем передаётся профессиональному управляющему. Доходности ниже — ориентиры витрины, а не расчёт финансового плана.</p></div>
      <aside class="finam-v2-tail__kpi-stack"><div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">${FINAM_V2_IDU_STRATEGIES.length}</div><div class="finam-v2-tail__kpi-label">стратегий в справочнике</div></div><div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">ДУ</div><div class="finam-v2-tail__kpi-label">отдельно от Comon</div></div></aside>
    </section>
    <section class="finam-v2-tail__card-grid">${chunk.map(iduCardHtml).join('\n      ')}<article class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Как использовать</p><p class="finam-v2-tail__body-text">Сначала выбираем роль стратегии в плане: валютный слой, облигационный контур, мультиактивный рост или тактический риск.</p></article></section>
    ${tailFooter('Ожидаемая доходность не является гарантией результата')}
  </article>`;
}

function replaceIduStrategiesPage(html) {
    return replaceFinamV2PageArticles(html, (article, index) => {
        const pageIndex = /ДУ\s*·\s*2\/2/.test(article) ? 1 : index;
        return buildIduArticle(pageIndex);
    });
}

function macroValue(row) {
    return maybeFinite(row?.value ?? row?.numeric_value ?? row?.rate ?? row?.close);
}

function macroLatest(series) {
    const rows = (Array.isArray(series) ? series : [])
        .map((row) => ({ date: normalizeDate(row?.date), value: macroValue(row) }))
        .filter((row) => row.date && row.value != null)
        .sort((a, b) => a.date - b.date);
    return rows[rows.length - 1] || null;
}

function macroSeriesPoints(series, maxCount = 9) {
    const rows = (Array.isArray(series) ? series : [])
        .map((row) => ({ date: normalizeDate(row?.date), value: macroValue(row) }))
        .filter((row) => row.date && row.value != null)
        .sort((a, b) => a.date - b.date);
    return sampleIndexes(rows.length, Math.min(maxCount, rows.length)).map((idx) => rows[idx]);
}

function macroPercent(value) {
    const n = maybeFinite(value);
    return n == null ? 'н/д' : `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function inflationChartSvg(macro) {
    const cpi = macroSeriesPoints(macro?.cpiYoySeries, 9);
    const key = macroSeriesPoints(macro?.keyRateSeries, 9);
    const points = cpi.length >= 2 ? cpi : key;
    if (points.length < 2) {
        return '<div class="finam-v2-tail__body-text">История макропоказателей временно недоступна. Страница обновится после синхронизации macro_indicators.</div>';
    }
    const allValues = [...cpi, ...key].map((row) => row.value);
    const max = Math.max(...allValues, 1);
    const min = Math.min(...allValues, 0);
    const plot = { left: 34, right: 500, top: 22, bottom: 124 };
    const yFor = (value) => plot.bottom - ((value - min) / Math.max(1, max - min)) * (plot.bottom - plot.top);
    const xFor = (idx, length) => plot.left + (idx / Math.max(1, length - 1)) * (plot.right - plot.left);
    const poly = (rows) => rows.map((row, idx) => `${xFor(idx, rows.length).toFixed(1)},${yFor(row.value).toFixed(1)}`).join(' ');
    const firstYear = points[0].date.getFullYear();
    const midYear = points[Math.floor(points.length / 2)].date.getFullYear();
    const lastYear = points[points.length - 1].date.getFullYear();
    return `<svg class="finam-v2-tail__chart" viewBox="0 0 520 150" role="img" aria-label="Инфляция и ключевая ставка">
        <line x1="34" y1="124" x2="500" y2="124" stroke="#cbd5e1" />
        <line x1="34" y1="22" x2="34" y2="124" stroke="#cbd5e1" />
        <line x1="34" y1="98" x2="500" y2="98" stroke="#eef2f7" />
        <line x1="34" y1="72" x2="500" y2="72" stroke="#eef2f7" />
        <line x1="34" y1="46" x2="500" y2="46" stroke="#eef2f7" />
        ${cpi.length >= 2 ? `<polyline points="${poly(cpi)}" fill="none" stroke="#c2410c" stroke-width="2.4" stroke-linecap="round" />` : ''}
        ${key.length >= 2 ? `<polyline points="${poly(key)}" fill="none" stroke="#002a4a" stroke-width="2.4" stroke-linecap="round" />` : ''}
        <text x="36" y="141" class="finam-v2-tail__axis">${escapeHtml(firstYear)}</text>
        <text x="246" y="141" class="finam-v2-tail__axis">${escapeHtml(midYear)}</text>
        <text x="474" y="141" class="finam-v2-tail__axis">${escapeHtml(lastYear)}</text>
        <text x="370" y="51" class="finam-v2-tail__chart-value">ключевая ставка</text>
        <text x="370" y="88" class="finam-v2-tail__chart-value">инфляция</text>
      </svg>`;
}

function buildInflationArticle(model) {
    const macro = model?.macroData || {};
    const cpi = macroLatest(macro.cpiYoySeries);
    const key = macroLatest(macro.keyRateSeries);
    const ofz2 = macroLatest(macro.ofz2Series);
    const ofz5 = macroLatest(macro.ofz5Series);
    const ofz10 = macroLatest(macro.ofz10Series);
    const corp = macroLatest(macro.corpIndexSeries);
    return `<article class="finam-v2-page">
    ${tailPageHeader('Инфляция')}
    <section class="finam-v2-tail__hero finam-v2-tail__hero--wide">
      <div><p class="finam-v2-wow__eyebrow">Макроусловия плана</p><h1 class="finam-v2-wow__headline">Инфляция показывает, какую доходность должен обгонять капитал</h1><p class="finam-v2-wow__lead">Эта страница связывает расчёт целей с рыночным фоном: инфляцией, ключевой ставкой, кривой ОФЗ и корпоративным облигационным контуром.</p></div>
      <aside class="finam-v2-tail__kpi-stack"><div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">${escapeHtml(macroPercent(cpi?.value))}</div><div class="finam-v2-tail__kpi-label">инфляция год к году</div></div><div class="finam-v2-tail__kpi"><div class="finam-v2-tail__kpi-value">${escapeHtml(macroPercent(key?.value))}</div><div class="finam-v2-tail__kpi-label">ключевая ставка</div></div></aside>
    </section>
    <section class="finam-v2-tail__chart-card"><p class="finam-v2-tail__section-title">Динамика инфляции и ставок</p>${inflationChartSvg(macro)}</section>
    <section class="finam-v2-tail__card-grid finam-v2-tail__card-grid--4">
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">ОФЗ 2 года</p><div class="finam-v2-tail__kpi-value">${escapeHtml(macroPercent(ofz2?.value))}</div><p class="finam-v2-tail__body-text">короткий участок кривой</p></div>
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">ОФЗ 5 лет</p><div class="finam-v2-tail__kpi-value">${escapeHtml(macroPercent(ofz5?.value))}</div><p class="finam-v2-tail__body-text">средний срок портфеля</p></div>
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">ОФЗ 10 лет</p><div class="finam-v2-tail__kpi-value">${escapeHtml(macroPercent(ofz10?.value))}</div><p class="finam-v2-tail__body-text">долгий ориентир ставки</p></div>
      <div class="finam-v2-tail__note-card"><p class="finam-v2-tail__section-title">Корп. индекс</p><div class="finam-v2-tail__kpi-value">${escapeHtml(macroPercent(corp?.value))}</div><p class="finam-v2-tail__body-text">корпоративный облигационный контур</p></div>
    </section>
    <section class="finam-v2-wow__insight"><strong>Вывод для плана:</strong> если цель долгосрочная, важна не номинальная доходность сама по себе, а доходность после инфляции, налогов и комиссий.</section>
    <p class="finam-v2-tail__disclaimer finam-v2-tail__page-note">Макроданные загружаются из внешних индикаторов PFP и используются как рыночный фон для сценариев. Они не гарантируют будущую доходность портфеля.</p>
    ${tailFooter('Макроусловия объясняют сценарий, но не гарантируют результат')}
  </article>`;
}

function replaceInflationPage(html, context) {
    return replaceFinamV2PageArticles(html, () => buildInflationArticle(context.model));
}

const DEFAULT_RISK_LEGAL_NOTES = [
    'Материалы декларации носят информационный характер и не являются индивидуальной инвестиционной рекомендацией (ИИР).',
    'Прошлая доходность не гарантирует будущие результаты.',
    'Финансовые, пенсионные, брокерские и страховые условия, порядок гарантий, комиссии, ограничения и выплаты определяются действующим законодательством РФ, правилами провайдеров и документами конкретных продуктов.',
];

function replaceRiskDeclarationPage(html, context) {
    const notes = Array.isArray(context?.model?.riskDeclaration?.legalNotes) && context.model.riskDeclaration.legalNotes.length
        ? context.model.riskDeclaration.legalNotes
        : DEFAULT_RISK_LEGAL_NOTES;
    const disclaimer = `<p class="finam-v2-tail__disclaimer">\n      ${notes.map((note) => escapeHtml(note)).join(' ')}\n    </p>`;
    return String(html || '').replace(/<p class="finam-v2-tail__disclaimer">[\s\S]*?<\/p>/, disclaimer);
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
    const titlePlaceholder = '__FINAM_V2_GOAL_TITLE__';
    for (const sampleTitle of titleByType[pageType] || []) {
        out = replaceAll(out, sampleTitle, titlePlaceholder);
    }
    out = replaceAll(out, titlePlaceholder, title);

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
    const isStructuredSummaryPage = [
        FINAM_REPORT_V2_PAGE_TYPES.GOALS,
        FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY,
    ].includes(context.pageType);
    let out = isStructuredSummaryPage ? String(html || '') : replaceCommonSamples(html, context);
    out = replaceGoalSamples(out, context);
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE) {
        out = replaceCurrentStatePage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOALS) {
        out = replaceGoalsPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY) {
        out = replaceExecutiveSummaryPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY) {
        out = replacePortfolioSummaryPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING) {
        out = replaceTaxPlanningPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW) {
        out = replaceComonAutofollowPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES) {
        out = replaceIduStrategiesPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.INFLATION) {
        out = replaceInflationPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN) {
        out = replaceDetailedPlanPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION) {
        out = replaceRiskDeclarationPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE) {
        out = replaceFinReserveGoalPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE) {
        out = replaceLifeGoalPage(out, context);
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION) {
        out = replacePensionGoalPage(out, context);
        const pension = normalizePensionGoal(context.goal, context.helpers);
        out = out
            .replace(/607&nbsp;000(?:&nbsp;|\s)₽/g, moneyHtml(context.helpers, pension.targetFuture))
            .replace(/229&nbsp;589(?:&nbsp;|\s)₽/g, moneyHtml(context.helpers, pension.stateFuture))
            .replace(/377&nbsp;376(?:&nbsp;|\s)₽/g, moneyHtml(context.helpers, pension.gapFuture));
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME) {
        out = replaceInvestmentGoalArtifacts(out, context, 'passive-income');
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW) {
        out = replaceInvestmentGoalArtifacts(out, context, 'save-grow');
    }
    if (context.pageType === FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER) {
        out = replaceOtherGoalPage(out, context);
    }
    return out;
}

module.exports = {
    applyTemplateData,
};
