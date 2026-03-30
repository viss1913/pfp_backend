const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { publicUrlFromKey } = require('../../utils/r2Client');
const { resolveGoalCardImageSrc, GLOBAL_DEFAULTS } = require('../summary/buildSummaryOverviewHtml');

const STOKK_SUMMARY_ASSETS_R2_PREFIX = 'pdf-report-summary-stock-assets';

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

/**
 * @param {string} ref URL/путь к файлу или относительный путь
 * @param {string} rootDir корень репо
 * @param {boolean} inlineLocalAssets если true — пытаться inlining data:
 */
function resolveAssetSrc(ref, rootDir, inlineLocalAssets = false) {
    if (ref == null || !String(ref).trim()) return '';
    const s = String(ref).trim();
    if (/^https?:\/\//i.test(s)) return s;

    const abs = path.isAbsolute(s) ? s : path.resolve(rootDir, s);

    if (inlineLocalAssets && fs.existsSync(abs)) {
        try {
            return localFileToDataUrl(abs);
        } catch {
            /* fallthrough */
        }
    }

    // fallback: try R2 public for stock assets
    const basename = path.basename(abs);
    const r2Key = `${STOKK_SUMMARY_ASSETS_R2_PREFIX}/${basename}`;
    const pub = publicUrlFromKey(r2Key);
    if (pub) return pub;

    if (fs.existsSync(abs)) return pathToFileURL(abs).href;
    return '';
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
} = {}) {
    if (!Array.isArray(data) || data.length < 2) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="12">Нет данных</text>
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
        .map((gy) => `<line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="rgba(255,255,255,0.10)" stroke-width="1" />`)
        .join('\n');

    // X labels: разрежаем подписи, чтобы на длинных горизонтах не было "простыни" месяцев.
    // Сейчас data содержит точки каждый месяц, но подписывать каждый месяц — плохо читается в PDF.
    const maxXLabels = 7;
    const lastMonth = data[data.length - 1]?.month ?? (data.length - 1);

    // Набор "красивых" шагов. Выбираем минимальный шаг, который даёт <= maxXLabels подписей.
    const stepChoices = [1, 2, 3, 4, 6, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 120];
    let step = stepChoices[stepChoices.length - 1];
    for (const s of stepChoices) {
        const labelsCount = Math.floor(lastMonth / s) + 1;
        if (labelsCount <= maxXLabels) {
            step = s;
            break;
        }
    }

    // Для больших сроков показываем "годы" вместо "месяцев".
    const useYears = lastMonth >= 60;
    const labelY = height - 10; // фикс внутри SVG, чтобы не налезало на график
    const mCandidates = new Set([0]);
    for (let m = 0; m <= lastMonth; m += step) mCandidates.add(m);
    mCandidates.add(lastMonth);

    const xLabels = [];
    const sortedMs = [...mCandidates].sort((a, b) => a - b);
    for (const m of sortedMs) {
        const idx = data.findIndex((d) => d.month === m);
        if (idx < 0) continue;
        const px = points[idx]?.x;
        if (px == null) continue;
        const labelText = useYears ? Math.round(m / 12) : m;
        xLabels.push(
            `<text x="${px}" y="${labelY}" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="${useYears ? 9 : 8}">${labelText}</text>`
        );
    }

    const targetLegend = `
<g>
  <rect x="${x1 - 132}" y="${y0 - 6}" width="132" height="22" rx="10" fill="rgba(30,41,59,0.65)" stroke="rgba(255,255,255,0.14)" />
  <line x1="${x1 - 118}" y1="${y0 + 5}" x2="${x1 - 98}" y2="${y0 + 5}" stroke="${targetColor}" stroke-width="3" stroke-linecap="round" />
  <text x="${x1 - 92}" y="${y0 + 10}" fill="rgba(255,255,255,0.85)" font-size="10">Цель</text>
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
    <text x="${x0}" y="${y0 - 4}" fill="rgba(255,255,255,0.65)" font-size="10">₽</text>
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

function buildBasePageHtml({
    clientName,
    logoSrc,
    aiAvatarSrc,
    backgroundSrc,
    accentColor,
    textColor,
    lineColor,
    backgroundOverlayOpacity,
    backgroundDarknessPercent,
    inlineLocalAssets,
}) {
    const c = sanitizeHexColor(accentColor, '#8b5cf6');
    const t = sanitizeHexColor(textColor, '#ffffff');
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
      background: #0f172a;
    }
    .page__bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
    .page__bg--fallback { background: linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #0f172a 100%); }
    .page__bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .page__bg-overlay {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background: linear-gradient(
        135deg,
        rgba(15,23,42,${overlayOpacity}) 0%,
        rgba(30,41,59,${Math.max(0, overlayOpacity - 0.08)}) 45%,
        rgba(15,23,42,${Math.min(1, overlayOpacity + 0.04)}) 100%
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
      padding: 12px; border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(15,23,42,0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .ai-panel__avatar { width: 50px; height: 50px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.85); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .ai-panel__avatar img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .ai-panel__text { font-size: 11px; line-height: 1.35; color: ${t}; opacity: 0.92; }

    .client-panel {
      margin-bottom: 10px;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(15,23,42,0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .client-panel__title {
      font-size: 14px; font-weight: 700; margin: 0 0 8px 0;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(255,255,255,0.18);
    }

    .section { margin-top: 10px; }
    .h2 { font-size: 14px; font-weight: 700; margin: 0 0 7px 0; padding-bottom: 4px; border-bottom: 2px solid ${c}; }

    .card {
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.22);
      background: rgba(15,23,42,0.35);
      box-shadow: 0 8px 20px rgba(0,0,0,0.22);
    }

    .goal-hero {
      margin: 10px 0 12px 0;
      border-radius: 16px;
      padding: 14px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.06);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .goal-hero__row { display:flex; align-items:center; gap: 16px; }
    .goal-hero__img { width: 74px; height: 74px; border-radius: 18px; overflow:hidden; border: 2px solid rgba(255,255,255,0.18); flex-shrink:0; }
    .goal-hero__img img { width:100%; height:100%; object-fit:cover; display:block; }
    .goal-hero__title { font-size: 20px; font-weight: 800; margin: 0; }
    .goal-hero__sub { margin-top: 4px; font-size: 12px; opacity: 0.75; }

    .metrics { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .metric { border-radius: 14px; padding: 12px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); }
    .metric__label { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.85; }
    .metric__value { font-size: 20px; font-weight: 900; margin-top: 6px; }

    .chart-wrap {
      border-radius: 16px;
      padding: 14px;
      border: 1px solid rgba(${lineRgb},0.16);
      background: rgba(255,255,255,0.05);
      box-shadow: 0 8px 28px rgba(0,0,0,0.18);
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
          <div style="font-weight:800; margin-bottom: 6px;">ИИ Консультант</div>
          <div>Принял в расчёт ваши параметры и собрал прогноз по выбранной цели.</div>
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

function buildFinReservePageHtml({ goal, clientName, reportPayload, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);

    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent =
        options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = options.backgroundSrc || '';
    const logoSrc = options.logoSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockLogoPath, root, inlineLocalAssets);
    const aiAvatarSrc = options.aiAvatarSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockAiAvatarPath, root, inlineLocalAssets);

    const cardImg = resolveGoalCardImageSrc('FIN_RESERVE', root, inlineLocalAssets);

    const s = goal?.summary || {};
    const init = Number(s.initial_capital ?? 0);
    const monthly = Number(s.monthly_replenishment ?? 0);
    const targetMonths = Number(s.target_months ?? 12);
    const yieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const targetValue = Number(s.target_amount_future ?? s.projected_capital_at_end ?? 0);
    const instrumentName = getFirstInstrumentName(goal);

    const series = buildProjectionSeries(s);
    const chartSvg = buildAreaChartSvg(series, {
        width: 520,
        height: 170,
        accentColor: accentColor,
        targetColor: '#10b981',
    });

    const html = buildBasePageHtml({
        clientName,
        logoSrc,
        aiAvatarSrc,
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
              <div class="goal-hero__title">${escapeHtml(goal?.goal_name || 'Финансовый резерв')}</div>
              <div class="goal-hero__sub">Консервативный профиль • ${escapeHtml(instrumentName)}</div>
            </div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric" style="background: rgba(147,51,234,0.14); border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Начальный капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(init).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Ежемесячно</div>
            <div class="metric__value">${escapeHtml(Math.round(monthly).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.35);">
            <div class="metric__label">Целевая сумма</div>
            <div class="metric__value">${escapeHtml(Math.round(targetValue).toLocaleString('ru-RU'))} ₽</div>
          </div>
        </div>

        <div class="chart-wrap">
          <div class="chart-title">Прогноз накопления за ${escapeHtml(targetMonths)} месяцев</div>
          <div>${chartSvg}</div>
          <div style="margin-top:8px; font-size:12px; opacity:0.86;">
            Доходность: <b>${escapeHtml(yieldPercent)}%</b> годовых
          </div>
        </div>
` +
        buildGoalPageFinishHtml()
    );
}

function buildLifeProtectionPageHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);

    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent = options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = options.backgroundSrc || '';
    const aiAvatarSrc =
        options.aiAvatarSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockAiAvatarPath, root, inlineLocalAssets);
    const logoSrc = options.logoSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockLogoPath, root, inlineLocalAssets);

    const cardImg = resolveGoalCardImageSrc('LIFE', root, inlineLocalAssets);

    const s = goal?.summary || {};
    const details = goal?.details || {};

    const coverage = Number(s.target_coverage ?? s.target_amount_initial ?? 0);
    const yearlyPremium = Number(details.annual_premium ?? s.initial_capital ?? 0);
    const monthlyPremium = Number(s.monthly_replenishment ?? (yearlyPremium / 12));
    const taxBenefit = Number(s.total_tax_benefit ?? 0);

    const risks = getRisks(goal).slice(0, 3);

    const html = buildBasePageHtml({
        clientName,
        logoSrc,
        aiAvatarSrc,
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
          <div class="metric" style="background: rgba(147,51,234,0.14); border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Покрытие</div>
            <div class="metric__value">${escapeHtml(Math.round(coverage).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Годовой взнос</div>
            <div class="metric__value">${escapeHtml(Math.round(yearlyPremium).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.35);">
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
` +
        buildGoalPageFinishHtml()
    );
}

function buildPensionPageHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);

    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent =
        options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = options.backgroundSrc || '';
    const aiAvatarSrc =
        options.aiAvatarSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockAiAvatarPath, root, inlineLocalAssets);
    const logoSrc = options.logoSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockLogoPath, root, inlineLocalAssets);

    const cardImg = resolveGoalCardImageSrc('PENSION', root, inlineLocalAssets);

    const s = goal?.summary || {};
    const initCapital = Number(s.initial_capital ?? 0);
    const monthlyReplenishment = Number(s.monthly_replenishment ?? 0);
    const projectedPensionMonthlyPresent = Number(s.projected_pension_monthly_present ?? 0);
    const yearsToPension = Number(goal?.details?.state_pension?.years_to_pension ?? 0);

    const html = buildBasePageHtml({
        clientName,
        logoSrc,
        aiAvatarSrc,
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
          <div class="metric" style="background: rgba(147,51,234,0.14); border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Начальный капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(initCapital).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Ежемесячно</div>
            <div class="metric__value">${escapeHtml(Math.round(monthlyReplenishment).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.35);">
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

function buildInOutPageHtml({ goal, clientName, pageLabel, options = {} }) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);

    const accentColor = options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const textColor = options.textColor ?? GLOBAL_DEFAULTS.summaryTextColor;
    const lineColor = options.lineColor ?? options.accentColor ?? GLOBAL_DEFAULTS.summaryChartColor;
    const backgroundOverlayOpacity = options.backgroundOverlayOpacity ?? GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity;
    const backgroundDarknessPercent =
        options.backgroundDarknessPercent ?? Math.round(backgroundOverlayOpacity * 100);
    const bgSrc = options.backgroundSrc || '';
    const aiAvatarSrc =
        options.aiAvatarSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockAiAvatarPath, root, inlineLocalAssets);
    const logoSrc = options.logoSrc || resolveAssetSrc(GLOBAL_DEFAULTS.stockLogoPath, root, inlineLocalAssets);

    const cardImg =
        pageLabel === 'INVESTMENT'
            ? resolveGoalCardImageSrc('INVESTMENT', root, inlineLocalAssets)
            : resolveGoalCardImageSrc('OTHER', root, inlineLocalAssets);

    const s = goal?.summary || {};
    const init = Number(s.initial_capital ?? 0);
    const monthly = Number(s.monthly_replenishment ?? 0);
    const months = Number(s.target_months ?? 12);
    const yieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const targetValue = Number(s.projected_capital_at_end ?? s.target_amount_future ?? 0);

    const series = buildProjectionSeries(s);
    const chartSvg = buildAreaChartSvg(series, {
        width: 520,
        height: 160,
        accentColor,
        targetColor: '#10b981',
    });

    const portfolioInitial = Array.isArray(goal?.details?.initial_instruments)
        ? goal.details.initial_instruments.map((x) => ({ name: x.name, value: Number(x.share ?? x.value ?? 0) }))
        : [];

    const portfolioMonthly = Array.isArray(goal?.details?.monthly_instruments)
        ? goal.details.monthly_instruments.map((x) => ({ name: x.name, value: Number(x.share ?? x.value ?? 0) }))
        : [];

    // Уменьшаем круги, чтобы легенда и подписи поместились в фиксированной области карточек (PDF жёстко клипается)
    const pieInitial = buildConicPieHtml(portfolioInitial, { size: 104 });
    const pieMonthly = buildConicPieHtml(portfolioMonthly, { size: 104 });

    const html = buildBasePageHtml({
        clientName,
        logoSrc,
        aiAvatarSrc,
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
              <div class="goal-hero__title">${escapeHtml(goal?.goal_name || (pageLabel === 'INVESTMENT' ? 'Сохранить и приумножить' : 'Квартира'))}</div>
              <div class="goal-hero__sub">Цель ${escapeHtml(pageLabel === 'INVESTMENT' ? 'INVESTMENT' : 'OTHER')}</div>
            </div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric" style="background: rgba(147,51,234,0.14); border-color: rgba(147,51,234,0.35);">
            <div class="metric__label">Начальный капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(init).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.35);">
            <div class="metric__label">Ежемесячно</div>
            <div class="metric__value">${escapeHtml(Math.round(monthly).toLocaleString('ru-RU'))} ₽</div>
          </div>
          <div class="metric" style="background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.35);">
            <div class="metric__label">Итоговый капитал</div>
            <div class="metric__value">${escapeHtml(Math.round(targetValue).toLocaleString('ru-RU'))} ₽</div>
          </div>
        </div>

        <div class="chart-wrap">
          <div class="chart-title">Прогноз накопления за ${escapeHtml(months)} месяцев</div>
          ${chartSvg}
          <div style="margin-top:8px; font-size:12px; opacity:0.86;">
            Доходность: <b>${escapeHtml(yieldPercent)}%</b> годовых
          </div>
        </div>

        <div class="pie-grid">
          <div class="chart-wrap pie-card">
            <div class="pie-card__title">Портфель начального капитала</div>
            ${pieInitial}
          </div>
          <div class="chart-wrap pie-card">
            <div class="pie-card__title">Портфель пополнений</div>
            ${pieMonthly}
          </div>
        </div>
` +
        buildGoalPageFinishHtml()
    );
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
function buildGoalPageHtml({ goalType, goal, clientName, options = {} }) {
    if (goalType === 'FIN_RESERVE') return buildFinReservePageHtml({ goal, clientName, reportPayload: null, options });
    if (goalType === 'LIFE') return buildLifeProtectionPageHtml({ goal, clientName, options });
    if (goalType === 'PENSION') return buildPensionPageHtml({ goal, clientName, options });
    if (goalType === 'INVESTMENT') return buildInOutPageHtml({ goal, clientName, pageLabel: 'INVESTMENT', options });
    if (goalType === 'OTHER') return buildInOutPageHtml({ goal, clientName, pageLabel: 'OTHER', options });
    throw new Error(`Unknown goalType for goal page: ${goalType}`);
}

module.exports = { buildGoalPageHtml };

