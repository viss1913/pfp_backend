const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveReportRasterRef } = require('../../utils/reportRasterSrc');

/**
 * Единая спека обложки (Figma «Отчет» 1:1241, плашка Frame 400 — 1:1244).
 * И HTML для PDF, и JSON для ЛК строятся отсюда — расхождений не будет.
 */
const COVER_RENDER_SPEC = {
    version: 1,
    figma: {
        report_frame_id: '1:1241',
        background_rect_id: '1:1242',
        title_band_frame_id: '1:1244',
        title_text_id: '1:1245',
        date_text_id: '1:1243',
    },
    page: {
        margin_css: '0',
    },
    canvas: {
        width_px: 595,
        height_px: 842,
        background: '#ffffff',
        overflow: 'hidden',
    },
    /** Слой фона: картинка + градиенты поверх */
    background_layer: {
        position: 'absolute',
        left_px: 0,
        top_px: 0,
        width_px: 595,
        height_px: 842,
        pointer_events: 'none',
    },
    background_image: {
        position: 'absolute',
        inset_css: '0',
        width_percent: 100,
        height_percent: 100,
        object_fit: 'cover',
        display: 'block',
        /**
         * Небольшой кроп, чтобы убрать белые поля на обложках,
         * если агент загрузил картинку с внутренними отступами.
         */
        zoom_scale: 1.22,
    },
    /** Два линейных градиента как в Figma (buildCoverHtml) */
    gradients: {
        overlay_layers: [
            {
                type: 'linear',
                angle_deg: 182.06,
                stops: [
                    { color: 'rgba(255, 255, 255, 0.95)', position_percent: 0.73 },
                    { color: 'rgba(255, 255, 255, 0)', position_percent: 55.05 },
                ],
            },
            {
                type: 'linear',
                angle_deg: 180.03,
                stops: [
                    { color: 'rgba(255, 255, 255, 0)', position_percent: 49.6 },
                    { color: 'rgba(255, 255, 255, 0.85)', position_percent: 99.75 },
                ],
            },
        ],
        position: 'absolute',
        inset_css: '0',
    },
    title_band: {
        position: 'absolute',
        left_px: 0,
        top_px: 526,
        width_px: 350,
        min_height_px: 150,
        box_sizing: 'border-box',
        display: 'flex',
        align_items: 'center',
        justify_content: 'center',
        padding_top_px: 30,
        padding_right_px: 10,
        padding_bottom_px: 30,
        padding_left_px: 40,
        border_radius_px: { top_left: 0, top_right: 8, bottom_right: 8, bottom_left: 0 },
    },
    title: {
        margin_css: '0',
        width_px: 300,
        max_width_css: '100%',
        font_size_px: 30,
        line_height_px: 30,
        font_weight_css: 'normal',
        color: '#ffffff',
        text_transform: 'uppercase',
    },
    date: {
        position: 'absolute',
        left_px: 40,
        top_px: 702,
        margin_css: '0',
        font_size_px: 16,
        line_height_px: 30,
        color: '#000000',
        white_space: 'nowrap',
    },
    font: {
        /** В PDF подставляется @font-face из font_path */
        family_stack_css: "'ReportCover', 'DejaVu Sans', sans-serif",
        families: ['ReportCover', 'DejaVu Sans', 'sans-serif'],
    },
    /** Только для PDF-рендера на бэке; ЛК может игнорировать */
    pdf: {
        default_font_repo_relative_path: 'assets/fonts/Roboto-Regular.ttf',
    },
};

/** @deprecated для обратной совместимости — используй COVER_RENDER_SPEC */
const COVER_LAYOUT = {
    canvasWidth: COVER_RENDER_SPEC.canvas.width_px,
    canvasHeight: COVER_RENDER_SPEC.canvas.height_px,
    titleBand: {
        left: COVER_RENDER_SPEC.title_band.left_px,
        top: COVER_RENDER_SPEC.title_band.top_px,
        width: COVER_RENDER_SPEC.title_band.width_px,
        minHeight: COVER_RENDER_SPEC.title_band.min_height_px,
        paddingTop: COVER_RENDER_SPEC.title_band.padding_top_px,
        paddingRight: COVER_RENDER_SPEC.title_band.padding_right_px,
        paddingBottom: COVER_RENDER_SPEC.title_band.padding_bottom_px,
        paddingLeft: COVER_RENDER_SPEC.title_band.padding_left_px,
        borderRadiusRight: COVER_RENDER_SPEC.title_band.border_radius_px.top_right,
    },
    titleBlock: {
        width: COVER_RENDER_SPEC.title.width_px,
        fontSize: COVER_RENDER_SPEC.title.font_size_px,
        lineHeight: COVER_RENDER_SPEC.title.line_height_px,
    },
    date: {
        left: COVER_RENDER_SPEC.date.left_px,
        top: COVER_RENDER_SPEC.date.top_px,
        fontSize: COVER_RENDER_SPEC.date.font_size_px,
        lineHeight: COVER_RENDER_SPEC.date.line_height_px,
    },
};

/** Дефолты, если у агента нет записи в БД */
const GLOBAL_DEFAULTS = {
    coverTitle: 'персональное финансовое решение',
    titleBandColor: '#722257',
    /** относительный путь от корня репо */
    coverBackgroundPath: 'assets/reports/rostech/cover-background.webp',
};

/**
 * Дата для обложки: «20 марта 2026 г.» (часовой пояс — Europe/Moscow или REPORT_PDF_TZ).
 */
function formatCoverDateRu(date = new Date()) {
    const tz = process.env.REPORT_PDF_TZ || 'Europe/Moscow';
    let formatted = new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: tz,
    }).format(date);
    // ru-RU часто уже даёт «… 2026 г.» — не дублируем
    formatted = formatted.replace(/\s*г\.?\s*$/i, '').trim();
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
 * Полная спека для ЛК / превью: геометрия + цвета + текст (как в PDF).
 * @param {Object} o
 * @param {string} o.title_band_color — итоговый #RRGGBB
 * @param {string} o.cover_title
 * @param {string} o.date_line
 */
function buildCoverLayoutPayload(o = {}) {
    const title_band_color = sanitizeTitleBandColor(o.title_band_color ?? GLOBAL_DEFAULTS.titleBandColor);
    const spec = COVER_RENDER_SPEC;
    const br = spec.title_band.border_radius_px;
    const hasCustomBg = Boolean(o.cover_background_url && String(o.cover_background_url).trim());
    return {
        version: spec.version,
        figma: { ...spec.figma },
        page: { ...spec.page },
        canvas: { ...spec.canvas },
        background_layer: { ...spec.background_layer },
        background_image: { ...spec.background_image },
        gradients: { ...spec.gradients, overlay_layers: spec.gradients.overlay_layers.map((g) => ({ ...g, stops: g.stops.map((s) => ({ ...s })) })) },
        title_band: {
            ...spec.title_band,
            border_radius_px: { ...br },
            /** заливка плашки с учётом настроек агента */
            background: title_band_color,
        },
        title: { ...spec.title },
        date: { ...spec.date },
        font: { ...spec.font },
        pdf: { ...spec.pdf },
        /** Контент, как на сгенерированной обложке */
        content: {
            cover_title: o.cover_title ?? GLOBAL_DEFAULTS.coverTitle,
            date_line: o.date_line ?? formatCoverDateRu(),
        },
        /**
         * URL картинки в ответе API не дублируем — только корневое поле `cover_background_url`
         * (или GET /cover-image для signed). Здесь только справка про сток и флаг.
         */
        background: {
            uses_custom_upload: hasCustomBg,
            fallback_repo_relative_path: GLOBAL_DEFAULTS.coverBackgroundPath,
        },
    };
}

function gradientsToCssBackgroundImage(overlayLayers) {
    return overlayLayers
        .map((g) => {
            const stopStr = g.stops.map((s) => `${s.color} ${s.position_percent}%`).join(', ');
            return `linear-gradient(${g.angle_deg}deg, ${stopStr})`;
        })
        .join(',\n        ');
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
 * URL для <img src>: http(s) как есть; локальный растр → WebP/JPEG и file:// или data:
 */
async function resolveCoverImageSrc(coverRef, rootDir, inlineLocalAssets = false) {
    const fallback = path.join(rootDir, GLOBAL_DEFAULTS.coverBackgroundPath);
    const ref = (coverRef && String(coverRef).trim()) || fallback;
    return resolveReportRasterRef(ref, rootDir, rootDir, inlineLocalAssets);
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
async function buildReportCoverHtml(options = {}) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const opts = {
        coverTitle: options.coverTitle ?? GLOBAL_DEFAULTS.coverTitle,
        titleBandColor: sanitizeTitleBandColor(options.titleBandColor ?? GLOBAL_DEFAULTS.titleBandColor),
        coverBackgroundUrl: options.coverBackgroundUrl,
        dateLine: options.dateLine ?? formatCoverDateRu(),
        fontPath: options.fontPath || path.join(root, 'assets/fonts/Roboto-Regular.ttf'),
    };

    const coverSrc = await resolveCoverImageSrc(opts.coverBackgroundUrl, root, inlineLocalAssets);
    const fontAbs = path.resolve(opts.fontPath);
    const fontUrl =
        inlineLocalAssets && fs.existsSync(fontAbs)
            ? localFileToDataUrl(fontAbs)
            : pathToFileURL(fontAbs).href;

    const title = escapeHtml(opts.coverTitle);
    const dateLine = escapeHtml(opts.dateLine);
    const bandColor = opts.titleBandColor;
    const S = COVER_RENDER_SPEC;
    const Tb = S.title_band;
    const Tt = S.title;
    const D = S.date;
    const br = Tb.border_radius_px;
    const gradCss = gradientsToCssBackgroundImage(S.gradients.overlay_layers);

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
      size: ${S.canvas.width_px}px ${S.canvas.height_px}px;
      margin: ${S.page.margin_css};
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      width: ${S.canvas.width_px}px;
      height: ${S.canvas.height_px}px;
      overflow: hidden;
      background: ${S.canvas.background};
    }

    .report-cover {
      position: relative;
      width: ${S.canvas.width_px}px;
      height: ${S.canvas.height_px}px;
      background: ${S.canvas.background};
      overflow: ${S.canvas.overflow};
      font-family: ${S.font.family_stack_css};
    }

    .report-cover__bg-wrap {
      position: ${S.background_layer.position};
      left: ${S.background_layer.left_px}px;
      top: ${S.background_layer.top_px}px;
      width: ${S.background_layer.width_px}px;
      height: ${S.background_layer.height_px}px;
      pointer-events: ${S.background_layer.pointer_events};
    }

    .report-cover__bg-wrap img {
      position: ${S.background_image.position};
      inset: ${S.background_image.inset_css};
      width: ${S.background_image.width_percent}%;
      height: ${S.background_image.height_percent}%;
      object-fit: ${S.background_image.object_fit};
      transform: scale(${S.background_image.zoom_scale});
      transform-origin: center center;
      display: ${S.background_image.display};
    }

    .report-cover__gradient {
      position: ${S.gradients.position};
      inset: ${S.gradients.inset_css};
      background-image:
        ${gradCss};
    }

    .report-cover__title-band {
      position: ${Tb.position};
      left: ${Tb.left_px}px;
      top: ${Tb.top_px}px;
      width: ${Tb.width_px}px;
      min-height: ${Tb.min_height_px}px;
      box-sizing: ${Tb.box_sizing};
      display: ${Tb.display};
      align-items: ${Tb.align_items};
      justify-content: ${Tb.justify_content};
      background: ${bandColor};
      padding: ${Tb.padding_top_px}px ${Tb.padding_right_px}px ${Tb.padding_bottom_px}px ${Tb.padding_left_px}px;
      border-radius: ${br.top_left}px ${br.top_right}px ${br.bottom_right}px ${br.bottom_left}px;
    }

    .report-cover__title {
      margin: ${Tt.margin_css};
      width: ${Tt.width_px}px;
      max-width: ${Tt.max_width_css};
      font-size: ${Tt.font_size_px}px;
      line-height: ${Tt.line_height_px}px;
      font-weight: ${Tt.font_weight_css};
      color: ${Tt.color};
      text-transform: ${Tt.text_transform};
    }

    .report-cover__date {
      position: ${D.position};
      left: ${D.left_px}px;
      top: ${D.top_px}px;
      margin: ${D.margin_css};
      font-size: ${D.font_size_px}px;
      line-height: ${D.line_height_px}px;
      color: ${D.color};
      white-space: ${D.white_space};
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
async function buildRostechCoverHtml(options = {}) {
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
    COVER_RENDER_SPEC,
    COVER_LAYOUT,
    buildCoverLayoutPayload,
    formatCoverDateRu,
    sanitizeTitleBandColor,
};
