const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveGoalCardImageSrc, GLOBAL_DEFAULTS } = require('../summary/buildSummaryOverviewHtml');
const { resolveReportRasterRef } = require('../../utils/reportRasterSrc');
const {
    buildRostechStyleAchievementBlock,
    buildMonthlyCashflowTableInner,
    getMonthlyScheduleChunksFromRows,
    buildAggregatedMonthlyScheduleByGoals,
} = require('./defaultRostechStyleCharts');
const { buildRostechPensionPagesHtml } = require('../themes/rostech/buildRostechPensionPagesHtml');

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatMoneyRu(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${Math.round(x).toLocaleString('ru-RU')} ₽`;
}

function formatPercentRu(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(1).replace('.', ',')}%`;
}

function sanitizeHexColor(hex, fallback) {
    if (typeof hex !== 'string') return fallback;
    const t = hex.trim();
    return /^#[0-9A-Fa-f]{6}$/.test(t) ? t : fallback;
}

function sanitizeOpacity(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

function sanitizePercent(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function hexToRgb(hex, fallback = '255,255,255') {
    if (typeof hex !== 'string') return fallback;
    const t = hex.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(t)) return fallback;
    const r = parseInt(t.slice(1, 3), 16);
    const g = parseInt(t.slice(3, 5), 16);
    const b = parseInt(t.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

function mimeTypeForLocalFile(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    const map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.ttf': 'font/ttf',
    };
    return map[ext] || 'application/octet-stream';
}

function localFileToDataUrl(absPath) {
    const buf = fs.readFileSync(absPath);
    const mime = mimeTypeForLocalFile(absPath);
    return `data:${mime};base64,${buf.toString('base64')}`;
}

function buildProjectionSeries(goalSummary, { maxPoints = 3600 } = {}) {
    const months = Number(goalSummary?.target_months ?? goalSummary?.term_months ?? 12) || 12;
    const monthlyRate = Number(goalSummary?.accumulation_yield_percent ?? 0) / 100 / 12;
    const initialCapital = Number(goalSummary?.initial_capital ?? 0) || 0;
    const monthlyReplenishment = Number(goalSummary?.monthly_replenishment ?? 0) || 0;
    const target = Number(goalSummary?.target_amount_future ?? goalSummary?.projected_capital_at_end ?? 0) || 0;

    const points = Math.max(0, Math.min(months, maxPoints));
    const data = [];

    // Формула как в прототипе: currentValue * (1+r)^i + monthly * (( (1+r)^i -1)/r)
    // Если r = 0, берём линейный рост.
    for (let i = 0; i <= points; i++) {
        const growthFactor = monthlyRate === 0 ? 1 : Math.pow(1 + monthlyRate, i);
        const value =
            monthlyRate === 0
                ? initialCapital + monthlyReplenishment * i
                : initialCapital * growthFactor +
                    monthlyReplenishment * ((growthFactor - 1) / monthlyRate);

        data.push({
            month: i,
            value: Math.round(value),
            target,
        });
    }

    return data;
}

function buildAreaChartSvg(data, {
    width = 520,
    height = 180,
    paddingLeft = 40,
    paddingRight = 18,
    paddingTop = 16,
    paddingBottom = 34,
    accentColor = '#3b82f6',
    targetColor = '#10b981',
    gridColor = 'rgba(148,163,184,0.35)',
    labelColor = '#475569',
    axisUnitColor = '#64748b',
    legendBg = 'rgba(255,255,255,0.96)',
    legendBorder = 'rgba(148,163,184,0.45)',
} = {}) {
    if (!Array.isArray(data) || data.length < 2) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#64748b" font-size="12">Нет данных</text>
</svg>`;
    }

    const maxY = Math.max(...data.map((d) => Number(d.value) || 0), 1);
    const minY = 0;
    const x0 = paddingLeft;
    const x1 = width - paddingRight;
    const y0 = paddingTop;
    const y1 = height - paddingBottom;

    const mapX = (i) => {
        const maxIndex = data.length - 1;
        const t = maxIndex === 0 ? 0 : i / maxIndex;
        return x0 + t * (x1 - x0);
    };
    const mapY = (v) => {
        const t = (Number(v) - minY) / (maxY - minY || 1);
        return y1 - t * (y1 - y0);
    };

    const points = data.map((d, i) => ({ x: mapX(i), y: mapY(d.value) }));
    const areaPath =
        `M ${points[0].x} ${y1} ` +
        points.map((p) => `L ${p.x} ${p.y}`).join(' ') +
        ` L ${points[points.length - 1].x} ${y1} Z`;
    const linePath = `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;

    const target = Number(data[0]?.target ?? 0) || 0;
    const targetY = mapY(target);
    const targetPath = `M ${x0} ${targetY} L ${x1} ${targetY}`;

    // Grid lines (simple)
    const gridCount = 4;
    const gridYs = Array.from({ length: gridCount + 1 }).map((_, i) => y0 + ((y1 - y0) * i) / gridCount);

    const grid = gridYs
        .map((gy) => `<line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="${gridColor}" stroke-width="1" />`)
        .join('\n');

    const lastMonth = data[data.length - 1]?.month ?? (data.length - 1);
    const step = 12; // подпись каждый год
    const labelY = height - 10; // фикс внутри SVG, чтобы не налезало на график
    const mCandidates = new Set([0]);
    for (let m = 0; m <= lastMonth; m += step) mCandidates.add(m);
    mCandidates.add(lastMonth);

    const startDate = new Date();
    startDate.setDate(1);
    const dateFmt = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' });
    const xLabels = [];
    const sortedMs = [...mCandidates].sort((a, b) => a - b);
    for (const m of sortedMs) {
        const idx = data.findIndex((d) => d.month === m);
        if (idx < 0) continue;
        const px = points[idx]?.x;
        if (px == null) continue;
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + m);
        const labelText = dateFmt.format(d).replace(/\s?г\./, '');
        xLabels.push(
            `<text x="${px}" y="${labelY}" text-anchor="middle" fill="${labelColor}" font-size="9">${labelText}</text>`
        );
    }

    const targetLegend = `
<g>
  <rect x="${x1 - 132}" y="${y0 - 6}" width="132" height="22" rx="10" fill="${legendBg}" stroke="${legendBorder}" />
  <line x1="${x1 - 118}" y1="${y0 + 5}" x2="${x1 - 98}" y2="${y0 + 5}" stroke="${targetColor}" stroke-width="3" stroke-linecap="round" />
  <text x="${x1 - 92}" y="${y0 + 10}" fill="${labelColor}" font-size="10">Цель</text>
</g>`;

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Прогноз накопления">
  <defs>
    <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.55" />
      <stop offset="100%" stop-color="${accentColor}" stop-opacity="0.05" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
  ${grid}
  <path d="${areaPath}" fill="url(#fillArea)" stroke="none" />
  <path d="${linePath}" fill="none" stroke="${accentColor}" stroke-width="2.8" stroke-linecap="round" />
  <path d="${targetPath}" fill="none" stroke="${targetColor}" stroke-width="2" stroke-dasharray="6 4" />
  <g>
    ${xLabels.join('\n')}
    <text x="${x0}" y="${y0 - 4}" fill="${axisUnitColor}" font-size="10">₽</text>
  </g>
  ${targetLegend}
</svg>`;
}

function buildConicPieHtml(items, {
    size = 120,
    colors = ['#3b82f6', '#6366f1', '#a855f7', '#60a5fa', '#8b5cf6', '#10b981', '#f59e0b'],
} = {}) {
    const safeItems = Array.isArray(items) ? items : [];
    const total = safeItems.reduce((s, it) => s + Number(it.value ?? it.share ?? 0), 0);
    if (safeItems.length === 0 || total <= 0) {
        return `<div class="pie-empty" style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14)"></div>`;
    }

    let current = 0;
    const stops = safeItems
        .map((it, idx) => {
            const v = Number(it.value ?? it.share ?? 0) || 0;
            const share = (v / total) * 100;
            const start = current;
            const end = current + share;
            current = end;
            const color = colors[idx % colors.length];
            return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
        })
        .join(', ');

    const legendItems = safeItems
        .map((it, idx) => {
            const name = String(it.name ?? '').trim() || '—';
            const v = Number(it.value ?? it.share ?? 0) || 0;
            const pct = Math.round((v / total) * 100);
            const color = colors[idx % colors.length];
            return `<li><span class="dot" style="background:${color}"></span><span class="lg-name">${escapeHtml(name)}</span><span class="lg-pct">${pct}%</span></li>`;
        })
        .join('');

    return `
<div class="pie-wrap">
  <div class="pie" style="width:${size}px;height:${size}px;border-radius:50%;background:conic-gradient(${stops});border:1px solid rgba(255,255,255,0.14);box-shadow:0 8px 26px rgba(0,0,0,0.25);"></div>
  <ul class="pie-legend">${legendItems}</ul>
</div>`;
}

function getFirstInstrumentName(goal) {
    const list = goal?.details?.initial_instruments;
    if (Array.isArray(list) && list[0]?.name) return String(list[0].name);
    return 'МТС Счёт';
}

function getRisks(goal) {
    const r = goal?.details?.risks;
    return Array.isArray(r) ? r : [];
}

function buildInstrumentsYieldRows(items, limit = 3) {
    const list = Array.isArray(items) ? items.slice(0, limit) : [];
    if (!list.length) {
        return '<tr><td colspan="3">Данные по инструментам пока не заполнены</td></tr>';
    }
    return list
        .map((item) => {
            const name = escapeHtml(item?.name || 'Инструмент');
            const share = Number(item?.share);
            const shareCell = Number.isFinite(share) ? `${Math.round(share)}%` : '—';
            const yieldCell = formatPercentRu(item?.yield_percent ?? item?.yield);
            return `<tr><td>${name}</td><td>${shareCell}</td><td>${yieldCell}</td></tr>`;
        })
        .join('');
}

function buildMonthlyContributionsRows(monthlyContributions, limit = 4) {
    const rows = Array.isArray(monthlyContributions?.rows) ? monthlyContributions.rows.slice(0, limit) : [];
    if (!rows.length) return '<tr><td colspan="2">Нет помесячного графика пополнений</td></tr>';
    return rows
        .map((row) => `<tr><td>${escapeHtml(row?.date || '—')}</td><td>${formatMoneyRu(row?.replenishment)}</td></tr>`)
        .join('');
}

function buildGoalPerformanceSection(goal) {
    const metrics = goal?.pdf_metrics || {};
    const portfolioYield = formatPercentRu(metrics?.portfolio_yield_percent ?? goal?.summary?.accumulation_yield_percent);
    const instruments = metrics?.initial_instruments || goal?.details?.initial_instruments || [];
    const monthlyContributions = metrics?.monthly_contributions || null;

    return `
      <div class="perf-grid">
        <div class="perf-card">
          <div class="perf-card__title">Доходность портфеля цели</div>
          <div class="perf-card__value">${portfolioYield}</div>
        </div>
        <div class="perf-card">
          <div class="perf-card__title">Доходность инструментов</div>
          <table class="perf-table">
            <thead><tr><th>Инструмент</th><th>Доля</th><th>Доходн.</th></tr></thead>
            <tbody>${buildInstrumentsYieldRows(instruments)}</tbody>
          </table>
        </div>
        <div class="perf-card">
          <div class="perf-card__title">Помесячные пополнения</div>
          <table class="perf-table">
            <thead><tr><th>Месяц</th><th>Пополнение</th></tr></thead>
            <tbody>${buildMonthlyContributionsRows(monthlyContributions)}</tbody>
          </table>
        </div>
      </div>
    `;
}

function buildComonAutoStrategiesSection(showcase) {
    if (!showcase || showcase.enabled !== true || showcase.error) return '';
    const items = Array.isArray(showcase.items) ? showcase.items.slice(0, 3) : [];
    if (!items.length) return '';

    const rows = items
        .map((it) => {
            const name = escapeHtml(it?.name || 'Стратегия');
            const url = String(it?.url || '').trim();
            const safeUrl = escapeHtml(url);
            return `<div class="comon-card">
  <div class="comon-card__name">${name}</div>
  ${url ? `<a class="comon-card__btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Перейти к стратегии</a>` : ''}
</div>`;
        })
        .join('');

    return `<div class="section">
  <h2 class="h2">Автостратегии Финам</h2>
  <div class="comon-grid">${rows}</div>
</div>`;
}

function buildBasePageHtml({
    clientName,
    logoSrc,
    aiAvatarSrc,
    aiTitle,
    aiText,
    backgroundSrc,
    accentColor,
    textColor,
    lineColor,
    backgroundOverlayOpacity,
    backgroundDarknessPercent,
    inlineLocalAssets,
}) {
    const c = sanitizeHexColor(accentColor, '#5b6cff');
    const t = sanitizeHexColor(textColor, '#0f172a');
    const line = sanitizeHexColor(lineColor, c);

    const overlayOpacity = sanitizePercent(
        backgroundDarknessPercent,
        Math.round(sanitizeOpacity(backgroundOverlayOpacity, 0.58) * 100)
    ) / 100;

    const lineRgb = hexToRgb(line, '139,92,246'); // fallback ~ #8b5cf6

    const bg = backgroundSrc ? `img { }` : '';

    const cspMeta = inlineLocalAssets
        ? `<meta http-equiv="Content-Security-Policy" content="
default-src 'none';
img-src 'self' data: https: blob:;
style-src 'self' 'unsafe-inline';
font-src 'self' data: https:;
script-src 'none';
object-src 'none';
base-uri 'none';
">`
        : '';

    const bgBlock = backgroundSrc
        ? `<div class="page__bg" aria-hidden="true">
      <img class="page__bg-img" src="${escapeHtml(backgroundSrc)}" alt="" />
      <div class="page__bg-overlay"></div>
    </div>`
        : `<div class="page__bg page__bg--fallback" aria-hidden="true"></div>
    <div class="page__bg-overlay" aria-hidden="true"></div>`;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${cspMeta}
  <style>
    @page { size: 595px 842px; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .page {
      position: relative;
      width: 595px;
      height: 842px;
      overflow: hidden;
      padding: 20px 32px 32px 32px;
      font-family: 'ReportSummary', 'DejaVu Sans', sans-serif;
      font-size: 14px;
      line-height: 1.45;
      color: ${t};
      background: #f8fafc;
    }
    .page__bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
    .page__bg--fallback { background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 48%, #f8fafc 100%); }
    .page__bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .page__bg-overlay {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background: linear-gradient(
        135deg,
        rgba(255,255,255,${Math.min(0.92, Math.max(0.78, 1 - overlayOpacity))}) 0%,
        rgba(248,250,252,${Math.min(0.96, Math.max(0.82, 1 - overlayOpacity + 0.05))}) 45%,
        rgba(241,245,249,${Math.min(0.98, Math.max(0.84, 1 - overlayOpacity + 0.08))}) 100%
      );
    }
    .page__inner { position: relative; z-index: 1; height: 100%; overflow: hidden; }

    .top-logo {
      position: absolute;
      top: 12px;
      left: 32px;
      z-index: 2;
      pointer-events: none;
    }
    .top-logo img {
      height: 28px;
      width: auto;
      object-fit: contain;
      display: block;
    }

    .ai-panel {
      display: flex; gap: 14px; margin-bottom: 10px;
      padding: 12px; border-radius: 14px;
      border: 1px solid rgba(148,163,184,0.35);
      background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%);
      box-shadow: 0 12px 28px rgba(15,23,42,0.08);
    }
    .ai-panel__avatar { width: 50px; height: 50px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid rgba(148,163,184,0.45); box-shadow: 0 4px 12px rgba(15,23,42,0.1); }
    .ai-panel__avatar img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .ai-panel__text { font-size: 11px; line-height: 1.35; color: ${t}; opacity: 0.92; }
    .ai-panel__title { font-weight: 800; margin-bottom: 6px; }

    .client-panel {
      margin-bottom: 10px;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid rgba(148,163,184,0.35);
      background: rgba(255,255,255,0.96);
      box-shadow: 0 10px 24px rgba(15,23,42,0.08);
    }
    .client-panel__title {
      font-size: 14px; font-weight: 700; margin: 0 0 8px 0;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(148,163,184,0.35);
    }

    .section { margin-top: 10px; }
    .h2 { font-size: 14px; font-weight: 700; margin: 0 0 7px 0; padding-bottom: 4px; border-bottom: 2px solid ${c}; }

    .card {
      border-radius: 12px;
      border: 1px solid rgba(148,163,184,0.35);
      background: rgba(255,255,255,0.94);
      box-shadow: 0 8px 20px rgba(15,23,42,0.08);
    }

    .goal-hero {
      margin: 10px 0 12px 0;
      border-radius: 18px;
      padding: 14px;
      border: 1px solid rgba(148,163,184,0.34);
      background: linear-gradient(160deg, rgba(255,255,255,0.96) 0%, rgba(241,245,249,0.92) 100%);
      box-shadow: 0 12px 30px rgba(15,23,42,0.08);
    }
    .goal-hero__row { display:flex; align-items:center; gap: 16px; }
    .goal-hero__img { width: 74px; height: 74px; border-radius: 18px; overflow:hidden; border: 2px solid rgba(148,163,184,0.3); flex-shrink:0; }
    .goal-hero__img img { width:100%; height:100%; object-fit:cover; display:block; }
    .goal-hero__title { font-size: 20px; font-weight: 800; margin: 0; }
    .goal-hero__sub { margin-top: 4px; font-size: 12px; opacity: 0.72; color: #475569; }

    .metrics { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .metric { border-radius: 14px; padding: 12px; border: 1px solid rgba(148,163,184,0.32); background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%); box-shadow: 0 8px 18px rgba(15,23,42,0.06); }
    .metric__label { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.85; }
    .metric__value { font-size: 20px; font-weight: 900; margin-top: 6px; }

    .chart-wrap {
      border-radius: 18px;
      padding: 14px;
      border: 1px solid rgba(${lineRgb},0.16);
      background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%);
      box-shadow: 0 10px 28px rgba(15,23,42,0.08);
    }
    .chart-title {
      font-size: 14px;
      font-weight: 800;
      margin: 0 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 2px solid rgba(${lineRgb},0.55);
    }

    /* Как на summary: круг сверху, описание долей внизу (переносится и не уезжает). */
    .pie-wrap { display:flex; flex-direction: column; align-items:center; gap: 8px; }
    .pie-legend {
      list-style:none;
      padding:0;
      margin: 0;
      width: 100%;
      display:flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 12px;
    }
    .pie-legend li {
      display:inline-flex;
      align-items:center;
      gap: 6px;
      margin: 0;
      font-size: 9px;
      line-height: 1.25;
      white-space: normal;
    }
    /* В flex-контейнере запретим "сжимать" круг иначе он визуально становится овалом */
    .pie { flex-shrink: 0; aspect-ratio: 1 / 1; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display:inline-block; }
    /* Перенос названий, чтобы не отрезало в одну "простыню" */
    .lg-name {
      white-space: normal;
      overflow:hidden;
      max-width: 110px;
      word-break: break-word;
    }
    .lg-pct { font-weight: 800; }

    .pie-grid {
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
      align-items: start;
    }
    /* Фиксируем область карточек с диаграммами, чтобы правая диаграмма не уезжала за низ страницы */
    .pie-card {
      padding: 10px !important;
      height: 196px;
      overflow: hidden;
    }
    .pie-card__title {
      font-weight: 900;
      font-size: 12px;
      margin-bottom: 6px;
      line-height: 1.15;
    }

    .footer {
      position: absolute;
      left: 32px;
      right: 32px;
      bottom: 24px;
      font-size: 12px;
      opacity: 0.8;
      display:flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    .perf-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    .perf-card {
      border-radius: 14px;
      border: 1px solid rgba(148,163,184,0.35);
      background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%);
      box-shadow: 0 8px 20px rgba(15,23,42,0.07);
      padding: 8px;
      min-height: 126px;
      overflow: hidden;
    }
    .perf-card__title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      opacity: 0.86;
      margin-bottom: 6px;
    }
    .perf-card__value {
      font-size: 20px;
      font-weight: 900;
      margin-top: 10px;
    }
    .perf-table { width: 100%; border-collapse: collapse; font-size: 9px; line-height: 1.25; }
    .perf-table th, .perf-table td { padding: 3px 0; text-align: left; border-bottom: 1px dashed rgba(148,163,184,0.25); }
    .perf-table tbody tr:last-child td { border-bottom: 0; }
    .perf-table th:last-child, .perf-table td:last-child { text-align: right; }
    .comon-grid { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; }
    .comon-card {
      border-radius: 12px;
      border: 1px solid rgba(148,163,184,0.35);
      background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%);
      box-shadow: 0 8px 20px rgba(15,23,42,0.07);
      padding: 8px;
      min-height: 88px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
    }
    .comon-card__name { font-size: 10px; font-weight: 800; line-height: 1.3; }
    .comon-card__btn {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(${lineRgb},0.55);
      color: ${t};
      text-decoration: none;
      font-size: 9px;
      font-weight: 700;
      background: rgba(255,255,255,0.95);
      align-self: flex-start;
    }
  </style>
  <title>Отчет</title>
</head>
<body>
  <div class="page">
    ${bgBlock}
    <div class="page__inner">
      ${logoSrc ? `<div class="top-logo"><img src="${escapeHtml(logoSrc)}" alt="" /></div>` : ''}
      <div class="ai-panel" role="presentation">
        <div class="ai-panel__avatar"><img src="${escapeHtml(aiAvatarSrc)}" alt="" /></div>
        <div class="ai-panel__text">
          <div class="ai-panel__title">${escapeHtml(aiTitle || 'ИИ-консультант: коротко по цели')}</div>
          <div>${escapeHtml(aiText || 'Я собрал прогноз по цели и показываю ключевые метрики доходности, состава портфеля и пополнений.')}</div>
        </div>
      </div>
      <!-- Блок клиента удалён по ТЗ: в печатных страницах целей он не нужен -->
`;
}

function buildGoalPageFinishHtml() {
    return `
    </div>
    <div class="footer">
      <div>Страница • PDF</div>
      <div style="font-weight:700;">Bank Future</div>
    </div>
  </div>
</body>
</html>`;
}

async function loadDefaultGoalPageSkin(options = {}) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent =
        options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = '';
    const logoSrc =
        options.logoSrc ||
        (await resolveReportRasterRef(GLOBAL_DEFAULTS.stockLogoPath, root, root, inlineLocalAssets));
    const aiAvatarSrc =
        options.aiAvatarSrc ||
        (await resolveReportRasterRef(GLOBAL_DEFAULTS.stockAiAvatarPath, root, root, inlineLocalAssets));
    return {
        root,
        inlineLocalAssets,
        accentColor,
        textColor,
        lineColor,
        backgroundOverlayOpacity,
        backgroundDarknessPercent,
        bgSrc,
        logoSrc,
        aiAvatarSrc,
    };
}

function getScheduleGoalsFromOptions(options = {}, fallbackGoal = null) {
    const ordered = Array.isArray(options?.reportGoalsOrdered)
        ? options.reportGoalsOrdered.filter((g) => Array.isArray(g?.details?.monthly_schedule) && g.details.monthly_schedule.length)
        : [];
    if (ordered.length) return ordered;
    return fallbackGoal ? [fallbackGoal] : [];
}

function shouldRenderGlobalSchedule(goalType, options = {}) {
    const scheduleGoals = getScheduleGoalsFromOptions(options, null);
    if (!scheduleGoals.length) return false;
    return String(scheduleGoals[0]?.goal_type || '').toUpperCase() === String(goalType || '').toUpperCase();
}

async function buildMonthlySchedulePdfPages({ goals, clientName, skin }) {
    const aggregatedRows = buildAggregatedMonthlyScheduleByGoals(goals);
    const { chunks } = getMonthlyScheduleChunksFromRows(aggregatedRows);
    if (!chunks.length) return [];
    const total = chunks.length;
    const pages = [];
    for (let i = 0; i < chunks.length; i++) {
        const aiTitle = 'ИИ-консультант: график достижения целей';
        const aiText =
            total > 1
                ? `Страница ${i + 1} из ${total}: суммарный помесячный график пополнений и капитала по всем целям.`
                : `Суммарный помесячный график пополнений и капитала по всем целям.`;
        const base = buildBasePageHtml({
            clientName,
            logoSrc: skin.logoSrc,
            aiAvatarSrc: skin.aiAvatarSrc,
            aiTitle,
            aiText,
            backgroundSrc: skin.bgSrc,
            accentColor: skin.accentColor,
            textColor: skin.textColor,
            lineColor: skin.lineColor,
            backgroundOverlayOpacity: skin.backgroundOverlayOpacity,
            backgroundDarknessPercent: skin.backgroundDarknessPercent,
            inlineLocalAssets: skin.inlineLocalAssets,
        });
        const inner = buildMonthlyCashflowTableInner({
            rows: chunks[i],
            isFirstPage: i === 0,
            avatarSrc: skin.aiAvatarSrc,
        });
        pages.push(base + inner + buildGoalPageFinishHtml());
    }
    return pages;
}

async function buildFinReservePageHtml({ goal, clientName, reportPayload, options = {}, skin: skinIn }) {
    const skin = skinIn || (await loadDefaultGoalPageSkin(options));
    const { root, inlineLocalAssets } = skin;

    const cardImg = await resolveGoalCardImageSrc('FIN_RESERVE', root, inlineLocalAssets, root);

    const s = goal?.summary || {};
    const init = Number(s.initial_capital ?? 0);
    const monthly = Number(s.monthly_replenishment ?? 0);
    const yieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const targetValue = Number(s.target_amount_future ?? s.projected_capital_at_end ?? 0);
    const instrumentName = getFirstInstrumentName(goal);
    const achievementHtml = buildRostechStyleAchievementBlock(goal, options.overallPlan || null);

    const aiText = `По цели "${goal?.goal_name || 'Финансовый резерв'}" фокус на ликвидности и предсказуемом росте капитала. Ниже — прогноз в стиле корпоративного отчёта, блок достижения цели и доходность портфеля.`;
    const html = buildBasePageHtml({
        clientName,
        logoSrc: skin.logoSrc,
        aiAvatarSrc: skin.aiAvatarSrc,
        aiTitle: 'ИИ-консультант: стратегия финансового резерва',
        aiText,
        backgroundSrc: skin.bgSrc,
        accentColor: skin.accentColor,
        textColor: skin.textColor,
        lineColor: skin.lineColor,
        backgroundOverlayOpacity: skin.backgroundOverlayOpacity,
        backgroundDarknessPercent: skin.backgroundDarknessPercent,
        inlineLocalAssets: skin.inlineLocalAssets,
    });

    const yieldLabel = formatPercentRu(yieldPercent);

    return (
        html +
        `
        <div class="goal-hero">
          <div class="goal-hero__row">
            <div class="goal-hero__img"><img src="${escapeHtml(cardImg)}" alt="" /></div>
            <div>
              <div class="goal-hero__title">${escapeHtml(goal?.goal_name || 'Финансовый резерв')}</div>
              <div class="goal-hero__sub">Консервативный профиль • ${escapeHtml(instrumentName)}</div>
            </div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric" style="background: #f4f2ff; border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Начальный капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(init).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #eff6ff; border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Ежемесячно</div>
            <div class="metric__value">${escapeHtml(Math.round(monthly).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #ecfdf5; border-color: rgba(16,185,129,0.35);">
            <div class="metric__label">Целевая сумма</div>
            <div class="metric__value">${escapeHtml(Math.round(targetValue).toLocaleString('ru-RU'))} ₽</div>
          </div>
        </div>

        <div class="chart-wrap">
          <div class="chart-title">График достижения цели</div>
          <div style="margin-top:8px; font-size:12px; color:#334155;">
            Доходность: <b>${escapeHtml(yieldLabel)}</b> годовых
          </div>
          ${achievementHtml}
        </div>
` +
        buildGoalPageFinishHtml()
    );
}

async function buildFinReservePagesHtml(args) {
    const skin = await loadDefaultGoalPageSkin(args.options || {});
    const main = await buildFinReservePageHtml({ ...args, skin });
    const renderSchedule = shouldRenderGlobalSchedule('FIN_RESERVE', args.options || {});
    const rest = renderSchedule
        ? await buildMonthlySchedulePdfPages({
              goals: getScheduleGoalsFromOptions(args.options || {}, args.goal),
              clientName: args.clientName,
              skin,
          })
        : [];
    return [main, ...rest];
}

async function buildLifeProtectionPageHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);

    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent = options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = '';
    const aiAvatarSrc =
        options.aiAvatarSrc ||
        (await resolveReportRasterRef(GLOBAL_DEFAULTS.stockAiAvatarPath, root, root, inlineLocalAssets));
    const logoSrc =
        options.logoSrc ||
        (await resolveReportRasterRef(GLOBAL_DEFAULTS.stockLogoPath, root, root, inlineLocalAssets));

    const cardImg = await resolveGoalCardImageSrc('LIFE', root, inlineLocalAssets, root);

    const s = goal?.summary || {};
    const details = goal?.details || {};

    const coverage = Number(s.target_coverage ?? s.target_amount_initial ?? 0);
    const yearlyPremium = Number(details.annual_premium ?? s.initial_capital ?? 0);
    const monthlyPremium = Number(s.monthly_replenishment ?? (yearlyPremium / 12));
    const taxBenefit = Number(s.total_tax_benefit ?? 0);

    const risks = getRisks(goal).slice(0, 3);

    const aiText = `По цели "${goal?.goal_name || 'Защита жизни'}" собран план с акцентом на страховую защиту и стабильные взносы. Смотри ниже структуру доходности и пополнений.`;
    const html = buildBasePageHtml({
        clientName,
        logoSrc,
        aiAvatarSrc,
        aiTitle: 'ИИ-консультант: страховая защита',
        aiText,
        backgroundSrc: bgSrc,
        accentColor,
        textColor,
        lineColor,
        backgroundOverlayOpacity,
        backgroundDarknessPercent,
        inlineLocalAssets,
    });

    return (
        html +
        `
        <div class="goal-hero">
          <div class="goal-hero__row">
            <div class="goal-hero__img"><img src="${escapeHtml(cardImg)}" alt="" /></div>
            <div>
              <div class="goal-hero__title">${escapeHtml(goal?.goal_name || 'Защита жизни')}</div>
              <div class="goal-hero__sub">НСЖ • защита семьи</div>
            </div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric" style="background: #f4f2ff; border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Покрытие</div>
            <div class="metric__value">${escapeHtml(Math.round(coverage).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #eff6ff; border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Годовой взнос</div>
            <div class="metric__value">${escapeHtml(Math.round(yearlyPremium).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #ecfdf5; border-color: rgba(16,185,129,0.35);">
            <div class="metric__label">Налоговая льгота</div>
            <div class="metric__value">${escapeHtml(Math.round(taxBenefit).toLocaleString('ru-RU'))} ₽</div>
          </div>
        </div>

        <div class="chart-wrap">
          <div class="chart-title">Покрытие рисков</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            ${risks
                .map((r, idx) => {
                    const bg =
                        idx === 0
                            ? 'rgba(239,68,68,0.14)'
                            : idx === 1
                              ? 'rgba(251,146,60,0.14)'
                              : 'rgba(168,85,247,0.14)';
                    const border =
                        idx === 0
                            ? 'rgba(239,68,68,0.35)'
                            : idx === 1
                              ? 'rgba(251,146,60,0.35)'
                              : 'rgba(168,85,247,0.35)';
                    const iconColor = idx === 0 ? '#fca5a5' : idx === 1 ? '#fdba74' : '#d8b4fe';
                    const lim = Number(r.limit_amount ?? 0);
                    return `<div class="metric" style="background:${bg};border-color:${border};">
  <div class="metric__label" style="color:${iconColor};">Риск ${idx + 1}</div>
  <div style="font-weight:900; margin-top:6px; font-size:12px; line-height:1.25;">${escapeHtml(r.risk_name || '')}</div>
  <div style="font-weight:900; margin-top:10px; font-size:18px;">${escapeHtml(Math.round(lim).toLocaleString('ru-RU'))} ₽</div>
</div>`;
                })
                .join('')}
          </div>
          <div style="margin-top:10px; font-size:12px; opacity:0.86;">
            Ожидаемый взнос: <b>${escapeHtml(Math.round(monthlyPremium).toLocaleString('ru-RU'))} ₽</b> в месяц
          </div>
        </div>
        ${buildGoalPerformanceSection(goal)}
` +
        buildGoalPageFinishHtml()
    );
}

async function buildPensionPageHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);

    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent =
        options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = '';
    const aiAvatarSrc =
        options.aiAvatarSrc ||
        (await resolveReportRasterRef(GLOBAL_DEFAULTS.stockAiAvatarPath, root, root, inlineLocalAssets));
    const logoSrc =
        options.logoSrc ||
        (await resolveReportRasterRef(GLOBAL_DEFAULTS.stockLogoPath, root, root, inlineLocalAssets));

    const cardImg = await resolveGoalCardImageSrc('PENSION', root, inlineLocalAssets, root);

    const s = goal?.summary || {};
    const initCapital = Number(s.initial_capital ?? 0);
    const monthlyReplenishment = Number(s.monthly_replenishment ?? 0);
    const projectedPensionMonthlyPresent = Number(s.projected_pension_monthly_present ?? 0);
    const yearsToPension = Number(goal?.details?.state_pension?.years_to_pension ?? 0);

    const aiText = `По пенсионной цели рассчитан долгосрочный сценарий: темп накопления, ожидаемая доходность и дисциплина пополнений по месяцам.`;
    const html = buildBasePageHtml({
        clientName,
        logoSrc,
        aiAvatarSrc,
        aiTitle: 'ИИ-консультант: пенсионный сценарий',
        aiText,
        backgroundSrc: bgSrc,
        accentColor,
        textColor,
        lineColor,
        backgroundOverlayOpacity,
        backgroundDarknessPercent,
        inlineLocalAssets,
    });

    // Заглушка до точной верстки по Figma: базовые карточки/метрики и общий стиль.
    return (
        html +
        `
        <div class="goal-hero">
          <div class="goal-hero__row">
            <div class="goal-hero__img"><img src="${escapeHtml(cardImg)}" alt="" /></div>
            <div>
              <div class="goal-hero__title">${escapeHtml(goal?.goal_name || 'Госпенсия')}</div>
              <div class="goal-hero__sub">Пенсионная стратегия • до пенсии ${escapeHtml(String(yearsToPension))} лет</div>
            </div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric" style="background: #f4f2ff; border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Начальный капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(initCapital).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #eff6ff; border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Ежемесячно</div>
            <div class="metric__value">${escapeHtml(Math.round(monthlyReplenishment).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #ecfdf5; border-color: rgba(16,185,129,0.35);">
            <div class="metric__label">Желаемый доход</div>
            <div class="metric__value">${escapeHtml(Math.round(projectedPensionMonthlyPresent).toLocaleString('ru-RU'))} ₽</div>
          </div>
        </div>

        <div class="chart-wrap">
          <div class="chart-title">Прогноз пенсионного дохода</div>
          <div style="font-size:12px; opacity:0.86; line-height:1.6;">
            Доход (в ценах сегодня): <b>${escapeHtml(Math.round(projectedPensionMonthlyPresent).toLocaleString('ru-RU'))} ₽</b> в месяц
          </div>
        </div>
` +
        buildGoalPageFinishHtml()
    );
}

async function buildInOutPageHtml({ goal, clientName, pageLabel, options = {}, skin: skinIn }) {
    const skin = skinIn || (await loadDefaultGoalPageSkin(options));
    const { root, inlineLocalAssets } = skin;

    const cardImg =
        pageLabel === 'INVESTMENT'
            ? await resolveGoalCardImageSrc('INVESTMENT', root, inlineLocalAssets, root)
            : await resolveGoalCardImageSrc('OTHER', root, inlineLocalAssets, root);

    const s = goal?.summary || {};
    const init = Number(s.initial_capital ?? 0);
    const monthly = Number(s.monthly_replenishment ?? 0);
    const yieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const targetValue = Number(s.projected_capital_at_end ?? s.target_amount_future ?? 0);
    const achievementHtml = buildRostechStyleAchievementBlock(goal, options.overallPlan || null);
    const portfolioInitial = Array.isArray(goal?.details?.initial_instruments)
        ? goal.details.initial_instruments.map((x) => ({ name: x.name, value: Number(x.share ?? x.value ?? 0) }))
        : [];
    const portfolioMonthly = Array.isArray(goal?.details?.monthly_instruments)
        ? goal.details.monthly_instruments.map((x) => ({ name: x.name, value: Number(x.share ?? x.value ?? 0) }))
        : [];
    const pieInitial = buildConicPieHtml(portfolioInitial, { size: 72 });
    const pieMonthly = buildConicPieHtml(portfolioMonthly, { size: 72 });

    const displayGoalName =
        pageLabel === 'INVESTMENT'
            ? 'Сохранить и приумножить'
            : (goal?.goal_name || 'Квартира');
    const aiText = `По цели "${displayGoalName}" — прогноз накопления в стиле корпоративного отчёта, структура портфеля и помесячные пополнения.`;
    const html = buildBasePageHtml({
        clientName,
        logoSrc: skin.logoSrc,
        aiAvatarSrc: skin.aiAvatarSrc,
        aiTitle: 'ИИ-консультант: инвестиционная цель',
        aiText,
        backgroundSrc: skin.bgSrc,
        accentColor: skin.accentColor,
        textColor: skin.textColor,
        lineColor: skin.lineColor,
        backgroundOverlayOpacity: skin.backgroundOverlayOpacity,
        backgroundDarknessPercent: skin.backgroundDarknessPercent,
        inlineLocalAssets: skin.inlineLocalAssets,
    });

    const yieldLabel = formatPercentRu(yieldPercent);

    return (
        html +
        `
        <div class="goal-hero">
          <div class="goal-hero__row">
            <div class="goal-hero__img"><img src="${escapeHtml(cardImg)}" alt="" /></div>
            <div>
              <div class="goal-hero__title">${escapeHtml(displayGoalName)}</div>
              <div class="goal-hero__sub">Цель ${escapeHtml(pageLabel === 'INVESTMENT' ? 'INVESTMENT' : 'OTHER')}</div>
            </div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric" style="background: #f4f2ff; border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Начальный капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(init).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #eff6ff; border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Ежемесячно</div>
            <div class="metric__value">${escapeHtml(Math.round(monthly).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: #ecfdf5; border-color: rgba(16,185,129,0.35);">
            <div class="metric__label">Итоговый капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(targetValue).toLocaleString('ru-RU'))} ₽</div>
          </div>
        </div>

        <div class="chart-wrap">
          <div class="chart-title">График достижения цели</div>
          <div style="margin-top:8px; font-size:12px; color:#334155;">
            Доходность: <b>${escapeHtml(yieldLabel)}</b> годовых
          </div>
          ${achievementHtml}
        </div>

        <div class="pie-grid" style="margin-top:8px;">
          <div class="chart-wrap pie-card" style="height:138px;">
            <div class="pie-card__title">Портфель начального капитала</div>
            ${pieInitial}
          </div>
          <div class="chart-wrap pie-card" style="height:138px;">
            <div class="pie-card__title">Портфель пополнений</div>
            ${pieMonthly}
          </div>
        </div>
        ${pageLabel === 'INVESTMENT' ? buildComonAutoStrategiesSection(options.comonShowcase) : ''}
` +
        buildGoalPageFinishHtml()
    );
}

async function buildInOutPagesHtml(args) {
    const skin = await loadDefaultGoalPageSkin(args.options || {});
    const main = await buildInOutPageHtml({ ...args, skin });
    const renderSchedule = shouldRenderGlobalSchedule(args.pageLabel, args.options || {});
    const rest = renderSchedule
        ? await buildMonthlySchedulePdfPages({
              goals: getScheduleGoalsFromOptions(args.options || {}, args.goal),
              clientName: args.clientName,
              skin,
          })
        : [];
    return [main, ...rest];
}

function adaptRostechPensionTemplateToDefault(html, accentColor) {
    if (typeof html !== 'string' || !html.trim()) return '';
    const accent = sanitizeHexColor(accentColor, '#5b6cff');
    return html
        .replace(/#722257/gi, accent)
        .replace(/#7f1f67/gi, accent);
}

async function buildPensionPagesHtml(args) {
    const skin = await loadDefaultGoalPageSkin(args.options || {});
    const pages = await buildRostechPensionPagesHtml({
        ...args,
        options: { ...(args.options || {}), backgroundSrc: '', logoSrc: skin.logoSrc },
    });
    return (Array.isArray(pages) ? pages : [])
        .map((x) => adaptRostechPensionTemplateToDefault(x, skin.accentColor))
        .filter(Boolean);
}

/**
 * Генерирует HTML "страницы цели" для PDF-превью/печати.
 *
 * @param {object} args
 * @param {'FIN_RESERVE'|'LIFE'|'INVESTMENT'|'OTHER'|'PENSION'} args.goalType
 * @param {object} args.goal
 * @param {string} args.clientName
 * @param {{ inlineLocalAssets?: boolean, accentColor?: string, textColor?: string, backgroundSrc?: string, aiAvatarSrc?: string }} [args.options]
 */
async function buildGoalPagesHtml({ goalType, goal, clientName, options = {} }) {
    if (goalType === 'FIN_RESERVE') {
        return await buildFinReservePagesHtml({ goal, clientName, reportPayload: null, options });
    }
    if (goalType === 'LIFE') return [await buildLifeProtectionPageHtml({ goal, clientName, options })];
    if (goalType === 'PENSION') return await buildPensionPagesHtml({ goalType, goal, clientName, options });
    if (goalType === 'INVESTMENT') {
        return await buildInOutPagesHtml({ goal, clientName, pageLabel: 'INVESTMENT', options });
    }
    if (goalType === 'OTHER') return await buildInOutPagesHtml({ goal, clientName, pageLabel: 'OTHER', options });
    throw new Error(`Unknown goalType for goal page: ${goalType}`);
}

async function buildGoalPageHtml({ goalType, goal, clientName, options = {} }) {
    const pages = await buildGoalPagesHtml({ goalType, goal, clientName, options });
    return pages[0] || '';
}

module.exports = { buildGoalPageHtml, buildGoalPagesHtml };

