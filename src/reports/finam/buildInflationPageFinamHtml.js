function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function asPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2).replace('.', ',')}%`;
}

function asNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2).replace('.', ',');
}

function monthLabel(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' })
    .format(d)
    .replace(/\s?г\./, '');
}

function normalizeSeries(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const x = new Date(row?.date);
      const y = Number(row?.value);
      if (Number.isNaN(x.getTime()) || !Number.isFinite(y)) return null;
      return { date: x, value: y };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

function reduceSeriesForChart(series, maxPoints = 24) {
  if (!Array.isArray(series) || series.length <= maxPoints) return series || [];
  const step = Math.ceil(series.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < series.length; i += step) {
    sampled.push(series[i]);
  }
  const last = series[series.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function buildLineChartSvg(seriesIn, options = {}) {
  const maxPts = Number(options.maxPoints) > 0 ? Number(options.maxPoints) : 26;
  const series = reduceSeriesForChart(normalizeSeries(seriesIn), maxPts);
  const width = Number(options.width) || 520;
  const height = Number(options.height) || 200;
  const title = escapeHtml(options.title || 'График');
  const lineColor = options.lineColor || '#7c3aed';
  const gridColor = options.gridColor || 'rgba(148,163,184,0.35)';
  const textColor = options.textColor || '#334155';

  if (series.length < 2) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${textColor}" font-size="12">Недостаточно данных</text>
</svg>`;
  }

  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 30;
  const x0 = padL;
  const x1 = width - padR;
  const y0 = padT;
  const y1 = height - padB;
  const minY = Math.max(0, Math.min(...series.map((s) => s.value)) - 1);
  const maxY = Math.max(...series.map((s) => s.value)) + 1;

  const mapX = (idx) => {
    const t = idx / (series.length - 1);
    return x0 + t * (x1 - x0);
  };
  const mapY = (v) => {
    const t = (v - minY) / (maxY - minY || 1);
    return y1 - t * (y1 - y0);
  };

  const points = series.map((p, idx) => ({ x: mapX(idx), y: mapY(p.value), value: p.value, date: p.date }));
  const pathD = `M ${points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`;

  const gridLines = 4;
  const yTicks = Array.from({ length: gridLines + 1 }).map((_, i) => {
    const y = y0 + ((y1 - y0) * i) / gridLines;
    const v = maxY - ((maxY - minY) * i) / gridLines;
    return { y, label: asNumber(v) };
  });
  const grid = yTicks
    .map(
      (tick) =>
        `<line x1="${x0}" y1="${tick.y}" x2="${x1}" y2="${tick.y}" stroke="${gridColor}" stroke-width="1" />
<text x="${x0 - 6}" y="${tick.y + 3}" text-anchor="end" fill="${textColor}" font-size="9">${escapeHtml(tick.label)}</text>`
    )
    .join('\n');

  const xLabelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xLabels = [...new Set(xLabelIdx)]
    .map((idx) => {
      const p = points[idx];
      return `<text x="${p.x}" y="${height - 9}" text-anchor="middle" fill="${textColor}" font-size="9">${escapeHtml(
        monthLabel(p.date)
      )}</text>`;
    })
    .join('\n');

  const last = points[points.length - 1];
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
  ${grid}
  <path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="${last.x}" cy="${last.y}" r="3.8" fill="${lineColor}" />
  ${xLabels}
</svg>`;
}

function getLatest(series) {
  const s = normalizeSeries(series);
  return s.length ? s[s.length - 1].value : null;
}

async function buildInflationPageFinamHtml(data = {}) {
  const cpiYoySeries = normalizeSeries(data.cpiYoySeries);
  const keyRateSeries = normalizeSeries(data.keyRateSeries);
  const ofz2Series = normalizeSeries(data.ofz2Series);
  const ofz5Series = normalizeSeries(data.ofz5Series);
  const ofz10Series = normalizeSeries(data.ofz10Series);
  const corpIndexSeries = normalizeSeries(data.corpIndexSeries);

  const cpiYoyLatest = getLatest(cpiYoySeries);
  const keyRateLatest = getLatest(keyRateSeries);
  const ofz2Latest = getLatest(ofz2Series);
  const ofz5Latest = getLatest(ofz5Series);
  const ofz10Latest = getLatest(ofz10Series);
  const corpIndexLatest = getLatest(corpIndexSeries);

  const corpSpreadMin = Number.isFinite(ofz5Latest) ? ofz5Latest + 2 : null;
  const corpSpreadMax = Number.isFinite(ofz5Latest) ? ofz5Latest + 3 : null;

  const inflationYoyChart = buildLineChartSvg(cpiYoySeries, {
    title: 'Инфляция ИПЦ, год к году',
    lineColor: '#c2410c',
    maxPoints: 48,
  });

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'DejaVu Sans', 'Liberation Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                   'Helvetica Neue', Arial, sans-serif;
      background: #ffffff;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }
    article.page {
      font-size: 16px;
      width: 595px;
      height: 842px;
      background-color: #fafbfc;
      color: #000000;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 30px 36px 26px;
      overflow-wrap: break-word;
      word-break: break-word;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    article.page::before {
      content: '';
      position: absolute;
      inset: 0;
      background-color: transparent;
      background-image:
        linear-gradient(rgba(100, 120, 170, 0.14) 1px, transparent 1px),
        linear-gradient(90deg, rgba(100, 120, 170, 0.14) 1px, transparent 1px);
      background-size: 20px 20px;
      pointer-events: none;
      z-index: 0;
    }
    .content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .logo-mark { display: flex; align-items: center; gap: 6px; }
    .logo-dot { width: 8px; height: 8px; border-radius: 2px; background: #6366f1; }
    .logo-text {
      font-size: 10px; font-weight: 500; letter-spacing: 0.14em;
      text-transform: uppercase; color: #000000;
    }
    .doc-label {
      font-size: 11px; font-weight: 500; letter-spacing: 0.12em;
      text-transform: uppercase; color: #000000; padding: 4px 11px;
      border: 1px solid #000000; border-radius: 4px;
      max-width: 260px;
      text-align: center;
      line-height: 1.2;
    }
    .divider { height: 1px; background: #000000; margin-bottom: 10px; }
    .title { margin: 0 0 10px 0; font-size: 18px; line-height: 1.2; font-weight: 800; color: #000; }
    .lead {
      margin: 0 0 12px 0;
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid #ccc;
      background: #f3f3f3;
      font-size: 10px;
      line-height: 1.5;
      color: #222;
      position: relative;
    }
    .charts { display: grid; gap: 10px; }
    .chart-card {
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #ccc;
      background: #fff;
    }
    .chart-card h3 { margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.05em; }
    .chart-card p { margin: 0 0 8px 0; font-size: 10px; color: #444; }
    .chart-card p b { color: #000; }
    .metrics { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .metric-card {
      border-radius: 8px;
      border: 1px solid #ccc;
      background: #f3f3f3;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .metric-label { font-size: 9px; color: #555; margin-bottom: 3px; line-height: 1.2; font-weight: 500; }
    .metric-value { font-size: 14px; font-weight: 800; color: #000; }
    .metric-sub { font-size: 8px; color: #666; margin-top: 3px; line-height: 1.3; }
    .footnote {
      margin-top: auto;
      font-size: 9px;
      color: #555555;
      line-height: 1.4;
      border-top: 1px solid #cccccc;
      padding-top: 8px;
    }
    .footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #cccccc;
      flex-shrink: 0;
    }
    .footer-left { font-size: 12px; font-weight: 400; color: #555555; line-height: 1.45; }
    .footer-right { font-size: 12px; font-weight: 400; color: #555555; text-align: right; line-height: 1.45; }
    @media print {
      body { margin: 0; padding: 0; gap: 0; }
      article.page { page-break-after: always; }
      article.page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <article class="page">
    <div class="content">
      <header class="header">
        <div class="logo-mark">
          <div class="logo-dot"></div>
          <span class="logo-text">Финансовый план</span>
        </div>
        <div class="doc-label">Важная информация</div>
      </header>
      <div class="divider"></div>
      <h1 class="title">Инфляция и ключевая ставка</h1>
      <div class="lead">
        <p>На горизонте планирования мы отслеживаем инфляцию и ключевую ставку. При снижении инфляции обычно снижаются и базовые ставки, поэтому ожидания доходности по консервативным инструментам также корректируются по сроку достижения цели.</p>
      </div>
      <div class="charts">
        <div class="chart-card">
          <h3>Ключевая ставка Банка России</h3>
          <p>Текущее значение: <b>${escapeHtml(asPercent(keyRateLatest))}</b></p>
        </div>
        <div class="chart-card">
          <h3>Инфляция (ИПЦ, г/г)</h3>
          <p>Последнее значение в ряду: <b>${escapeHtml(asPercent(cpiYoyLatest))}</b></p>
          <div style="margin-top:5px;">
            ${inflationYoyChart}
          </div>
        </div>
      </div>
      <div class="metrics">
        <div class="metric-card">
          <div class="metric-label">Доходность ОФЗ 2 года</div>
          <div class="metric-value">${escapeHtml(asPercent(ofz2Latest))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Доходность ОФЗ 5 лет</div>
          <div class="metric-value">${escapeHtml(asPercent(ofz5Latest))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Доходность ОФЗ 10 лет</div>
          <div class="metric-value">${escapeHtml(asPercent(ofz10Latest))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">RUCBICP (корп. облигации)</div>
          <div class="metric-value">${escapeHtml(asNumber(corpIndexLatest))}</div>
          <div class="metric-sub">Индексный уровень в пунктах</div>
        </div>
        <div class="metric-card" style="grid-column: span 2;">
          <div class="metric-label">Оценка по корпоративным облигациям</div>
          <div class="metric-value">${Number.isFinite(corpSpreadMin) && Number.isFinite(corpSpreadMax)
      ? `${escapeHtml(asPercent(corpSpreadMin))} – ${escapeHtml(asPercent(corpSpreadMax))}`
      : '—'
    }</div>
          <div class="metric-sub">Обычно на 2-3 п.п. выше ОФЗ схожей дюрации</div>
        </div>
      </div>
      <p class="footnote">
        Источники: Банк России и MOEX (ставка ЦБ, ОФЗ, RUCBICP). Ряд инфляции г/г — исторические данные в системе ПФП. Оценка спреда корпоративных облигаций носит ориентировочный характер и не является индивидуальной инвестиционной рекомендацией.
      </p>
      <footer class="footer">
        <div class="footer-left">
          Персональный финансовый план · Конфиденциально<br>
          Все партнёры осуществляют деятельность на основании лицензий ЦБ РФ
        </div>
        <div class="footer-right">
          Информация не является индивидуальной<br>
          инвестиционной рекомендацией
        </div>
      </footer>
    </div>
  </article>
</body>
</html>`;
}

module.exports = {
  buildInflationPageFinamHtml,
};
