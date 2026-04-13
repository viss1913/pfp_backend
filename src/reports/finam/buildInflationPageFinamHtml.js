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
    const series = reduceSeriesForChart(normalizeSeries(seriesIn), 26);
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
    const inflationSeries = normalizeSeries(data.inflationSeries);
    const keyRateSeries = normalizeSeries(data.keyRateSeries);
    const ofz2Series = normalizeSeries(data.ofz2Series);
    const ofz5Series = normalizeSeries(data.ofz5Series);
    const ofz10Series = normalizeSeries(data.ofz10Series);
    const corpIndexSeries = normalizeSeries(data.corpIndexSeries);

    const inflationLatest = getLatest(inflationSeries);
    const keyRateLatest = getLatest(keyRateSeries);
    const ofz2Latest = getLatest(ofz2Series);
    const ofz5Latest = getLatest(ofz5Series);
    const ofz10Latest = getLatest(ofz10Series);
    const corpIndexLatest = getLatest(corpIndexSeries);

    const corpSpreadMin = Number.isFinite(ofz5Latest) ? ofz5Latest + 2 : null;
    const corpSpreadMax = Number.isFinite(ofz5Latest) ? ofz5Latest + 3 : null;

    const keyRateChart = buildLineChartSvg(keyRateSeries, {
        title: 'Ключевая ставка ЦБ',
        lineColor: '#1f2937',
    });

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 595px 842px; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'DejaVu Sans', 'Liberation Sans', sans-serif; color: #212121; }
    .page {
      width: 595px;
      height: 842px;
      padding: 24px 28px;
      background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 52%, #f8fafc 100%);
      overflow: hidden;
    }
    .title { margin: 0 0 8px 0; font-size: 22px; line-height: 1.15; font-weight: 800; }
    .lead {
      margin: 0 0 12px 0;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(148,163,184,0.35);
      background: rgba(255,255,255,0.72);
      font-size: 13px;
      line-height: 1.45;
      color: #1e293b;
    }
    .charts { display: grid; gap: 10px; }
    .chart {
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(148,163,184,0.32);
      background: linear-gradient(150deg, rgba(255,255,255,0.65), rgba(255,255,255,0.4));
      box-shadow: 0 8px 24px rgba(15,23,42,0.08);
    }
    .chart h3 { margin: 0 0 6px 0; font-size: 16px; font-weight: 800; }
    .chart p { margin: 0 0 6px 0; font-size: 12px; color: #334155; line-height: 1.45; }
    .metrics {
      margin-top: 10px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .metric {
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,0.32);
      background: rgba(255,255,255,0.68);
      padding: 8px;
      min-height: 76px;
    }
    .metric__label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .metric__value { font-size: 17px; font-weight: 900; color: #0f172a; }
    .metric__sub { font-size: 11px; color: #334155; margin-top: 3px; line-height: 1.35; }
    .footnote {
      margin-top: 10px;
      font-size: 11px;
      color: #475569;
      line-height: 1.4;
      border-top: 1px dashed rgba(148,163,184,0.55);
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="page" data-report-page="inflation_info">
    <h1 class="title">Важная информация: инфляция и ставка ЦБ</h1>
    <p class="lead">
      На горизонте планирования мы отслеживаем инфляцию и ключевую ставку. При снижении инфляции обычно
      снижаются и базовые ставки, поэтому ожидания доходности по консервативным инструментам также
      корректируются по сроку достижения цели.
    </p>
    <section class="charts">
      <article class="chart">
        <h3>Годовая инфляция</h3>
        <p>Текущее значение: <b>${escapeHtml(asPercent(inflationLatest))}</b></p>
      </article>
      <article class="chart">
        <h3>Ключевая ставка Банка России</h3>
        <p>Текущее значение: <b>${escapeHtml(asPercent(keyRateLatest))}</b></p>
        ${keyRateChart}
      </article>
    </section>
    <section class="metrics">
      <div class="metric">
        <div class="metric__label">Доходность ОФЗ 2 года</div>
        <div class="metric__value">${escapeHtml(asPercent(ofz2Latest))}</div>
      </div>
      <div class="metric">
        <div class="metric__label">Доходность ОФЗ 5 лет</div>
        <div class="metric__value">${escapeHtml(asPercent(ofz5Latest))}</div>
      </div>
      <div class="metric">
        <div class="metric__label">Доходность ОФЗ 10 лет</div>
        <div class="metric__value">${escapeHtml(asPercent(ofz10Latest))}</div>
      </div>
      <div class="metric">
        <div class="metric__label">RUCBICP (индекс корп. облигаций)</div>
        <div class="metric__value">${escapeHtml(asNumber(corpIndexLatest))}</div>
        <div class="metric__sub">Это индексный уровень в пунктах, а не прямая процентная ставка.</div>
      </div>
      <div class="metric" style="grid-column: span 2;">
        <div class="metric__label">Оценка по корпоративным облигациям</div>
        <div class="metric__value">${
            Number.isFinite(corpSpreadMin) && Number.isFinite(corpSpreadMax)
                ? `${escapeHtml(asPercent(corpSpreadMin))} - ${escapeHtml(asPercent(corpSpreadMax))}`
                : '—'
        }</div>
        <div class="metric__sub">Обычно корпоративные выпуски дают примерно на 2-3 п.п. выше ОФЗ схожей дюрации.</div>
      </div>
    </section>
    <p class="footnote">
      Источники: Банк России и MOEX. Исторические ряды за последние 12 месяцев из /api/pfp/macro/history/*.
      Оценка спреда корпоративных облигаций носит ориентировочный характер и не является индивидуальной инвестиционной рекомендацией.
    </p>
  </div>
</body>
</html>`;
}

module.exports = {
    buildInflationPageFinamHtml,
};
