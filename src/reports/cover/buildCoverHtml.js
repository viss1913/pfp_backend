const path = require('path');
const { pathToFileURL } = require('url');

/** Дефолты, если у агента нет записи в БД */
const GLOBAL_DEFAULTS = {
    coverTitle: 'персональное финансовое решение',
    titleBandColor: '#722257',
    /** относительный путь от корня репо */
    coverBackgroundPath: 'assets/reports/rostech/cover-background.jpg',
};

/**
 * Дата для обложки: «20 марта 2026 г.» (часовой пояс — Europe/Moscow или REPORT_PDF_TZ).
 */
function formatCoverDateRu(date = new Date()) {
    const tz = process.env.REPORT_PDF_TZ || 'Europe/Moscow';
    const formatted = new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: tz,
    }).format(date);
    return `${formatted} г.`;
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Только безопасный hex для inline style */
function sanitizeTitleBandColor(hex) {
    if (typeof hex !== 'string') return GLOBAL_DEFAULTS.titleBandColor;
    const t = hex.trim();
    return /^#[0-9A-Fa-f]{6}$/.test(t) ? t : GLOBAL_DEFAULTS.titleBandColor;
}

/**
 * URL для <img src>: http(s) как есть, иначе путь на диске → file://
 */
function resolveCoverImageSrc(coverRef, rootDir) {
    const fallback = path.join(rootDir, GLOBAL_DEFAULTS.coverBackgroundPath);
    const ref = (coverRef && String(coverRef).trim()) || fallback;
    if (/^https?:\/\//i.test(ref)) {
        return ref;
    }
    const abs = path.isAbsolute(ref) ? ref : path.resolve(rootDir, ref);
    return pathToFileURL(abs).href;
}

/**
 * HTML первой страницы обложки отчёта (A4 595×842 px, макет Figma «Отчет»).
 *
 * @param {Object} [options]
 * @param {string} [options.coverTitle]
 * @param {string} [options.titleBandColor] — #RRGGBB
 * @param {string} [options.coverBackgroundUrl] — публичный URL или относительный/абсолютный путь к файлу
 * @param {string} [options.dateLine] — если не задано, ставится сегодня по formatCoverDateRu
 * @param {string} [options.fontPath] — TTF
 */
function buildReportCoverHtml(options = {}) {
    const root = path.join(__dirname, '../../..');
    const opts = {
        coverTitle: options.coverTitle ?? GLOBAL_DEFAULTS.coverTitle,
        titleBandColor: sanitizeTitleBandColor(options.titleBandColor ?? GLOBAL_DEFAULTS.titleBandColor),
        coverBackgroundUrl: options.coverBackgroundUrl,
        dateLine: options.dateLine ?? formatCoverDateRu(),
        fontPath: options.fontPath || path.join(root, 'assets/fonts/Roboto-Regular.ttf'),
    };

    const coverSrc = resolveCoverImageSrc(opts.coverBackgroundUrl, root);
    const fontUrl = pathToFileURL(path.resolve(opts.fontPath)).href;

    const title = escapeHtml(opts.coverTitle);
    const dateLine = escapeHtml(opts.dateLine);
    const bandColor = opts.titleBandColor;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Отчёт</title>
  <style>
    @font-face {
      font-family: 'ReportCover';
      src: url('${fontUrl}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    @page {
      size: 595px 842px;
      margin: 0;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
    }

    .report-cover {
      position: relative;
      width: 595px;
      height: 842px;
      background: #ffffff;
      overflow: hidden;
      font-family: 'ReportCover', 'DejaVu Sans', sans-serif;
    }

    .report-cover__bg-wrap {
      position: absolute;
      left: 0;
      top: 0;
      width: 595px;
      height: 842px;
      pointer-events: none;
    }

    .report-cover__bg-wrap img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .report-cover__gradient {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(
          182.06deg,
          rgba(255, 255, 255, 0.95) 0.73%,
          rgba(255, 255, 255, 0) 55.05%
        ),
        linear-gradient(
          180.03deg,
          rgba(255, 255, 255, 0) 49.6%,
          rgba(255, 255, 255, 0.85) 99.75%
        );
    }

    .report-cover__title-band {
      position: absolute;
      left: 0;
      top: 526px;
      max-width: 350px;
      background: ${bandColor};
      padding: 30px 10px 30px 40px;
      border-radius: 0 8px 8px 0;
    }

    .report-cover__title {
      margin: 0;
      width: 300px;
      font-size: 30px;
      line-height: 30px;
      font-weight: normal;
      color: #ffffff;
      text-transform: uppercase;
    }

    .report-cover__date {
      position: absolute;
      left: 40px;
      top: 702px;
      margin: 0;
      font-size: 16px;
      line-height: 30px;
      color: #000000;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="report-cover" data-report-page="cover">
    <div class="report-cover__bg-wrap" aria-hidden="true">
      <img src="${escapeHtml(coverSrc)}" alt="" />
      <div class="report-cover__gradient"></div>
    </div>
    <div class="report-cover__title-band">
      <p class="report-cover__title">${title}</p>
    </div>
    <p class="report-cover__date">${dateLine}</p>
  </div>
</body>
</html>`;
}

/** @deprecated используй buildReportCoverHtml */
function buildRostechCoverHtml(options = {}) {
    return buildReportCoverHtml({
        ...options,
        coverTitle: options.title ?? options.coverTitle,
        coverBackgroundUrl: options.coverImagePath ?? options.coverBackgroundUrl,
    });
}

module.exports = {
    buildReportCoverHtml,
    buildRostechCoverHtml,
    GLOBAL_DEFAULTS,
    formatCoverDateRu,
    sanitizeTitleBandColor,
};
