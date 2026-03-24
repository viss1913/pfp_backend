const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/**
 * Вторая страница PDF («Сводная информация») — первая A4 из макета Figma PlanOverviewPage
 * (лого, блок ИИ, карточка клиента, фин. защита, до двух основных целей). Диаграммы — отдельная страница.
 */
const SUMMARY_RENDER_SPEC = {
    version: 1,
    page_id: 'summary_overview',
    canvas: { width_px: 595, height_px: 842 },
    padding_px: 32,
    font: {
        family_stack_css: "'ReportSummary', 'DejaVu Sans', sans-serif",
    },
    pdf: {
        default_font_repo_relative_path: 'assets/fonts/Roboto-Regular.ttf',
    },
};

/** Картинки карточек целей: `assets/reports/goal-cards/{GOAL_TYPE}.png` — см. README в папке */
const GOAL_CARDS_DIR = 'assets/reports/goal-cards';

const GLOBAL_DEFAULTS = {
    /** Акцент секций и будущих диаграмм (пироги и т.д.) */
    summaryChartColor: '#8b5cf6',
    /** от корня репо */
    stockLogoPath: 'assets/reports/summary/stock-logo.png',
    stockAiAvatarPath: 'assets/reports/summary/stock-ai-avatar.png',
};

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sanitizeSummaryChartColor(hex) {
    if (typeof hex !== 'string') return GLOBAL_DEFAULTS.summaryChartColor;
    const t = hex.trim();
    return /^#[0-9A-Fa-f]{6}$/.test(t) ? t : GLOBAL_DEFAULTS.summaryChartColor;
}

/** @deprecated используй sanitizeSummaryChartColor */
function sanitizeSummaryAccentColor(hex) {
    return sanitizeSummaryChartColor(hex);
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
 * @param {boolean} [inlineLocalAssets] — для HTML в браузере ЛК: вшить локальные файлы как data:, иначе file:// (Puppeteer на сервере)
 */
function resolveAssetSrc(ref, rootDir, inlineLocalAssets = false) {
    if (ref == null || !String(ref).trim()) return null;
    const s = String(ref).trim();
    if (/^https?:\/\//i.test(s)) return s;
    const abs = path.isAbsolute(s) ? s : path.resolve(rootDir, s);
    if (inlineLocalAssets && fs.existsSync(abs)) {
        try {
            return localFileToDataUrl(abs);
        } catch {
            return pathToFileURL(abs).href;
        }
    }
    return pathToFileURL(abs).href;
}

function formatMoneyRu(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${Math.round(x).toLocaleString('ru-RU')} ₽`;
}

function extractGoals(payload) {
    if (!payload || typeof payload !== 'object') return [];
    return payload.goals || payload.goals_detailed || [];
}

function extractTotalMonthlyReplenishment(payload) {
    const cp =
        payload?.summary?.consolidated_portfolio ||
        payload?.overall_plan?.consolidated_portfolio;
    if (cp && cp.total_monthly_replenishment != null) {
        return Number(cp.total_monthly_replenishment);
    }
    return extractGoals(payload).reduce(
        (s, g) => s + Number(g?.summary?.monthly_replenishment || 0),
        0
    );
}

function buildDefaultAiIntro(clientName, totalMonthlyFormatted) {
    const name = clientName || 'Клиент';
    return `<span class="fw-600">${escapeHtml(name)}</span>, добрый день! Я проанализировал ваши финансовые цели. Ваш план рассчитан с учётом инфляции — для каждой цели она своя. Общее ежемесячное пополнение составляет <span class="fw-600">${escapeHtml(
        totalMonthlyFormatted
    )}</span>. План достижим при соблюдении стратегии. Давайте рассмотрим детали.`;
}

/**
 * JSON для ЛК: геометрия страницы + брендинг (без дубля URL — корневые поля API).
 */
function buildSummaryLayoutPayload(o = {}) {
    const chart = sanitizeSummaryChartColor(
        o.summary_chart_color ?? o.summary_accent_color ?? GLOBAL_DEFAULTS.summaryChartColor
    );
    const hasLogo = Boolean(o.summary_logo_url && String(o.summary_logo_url).trim());
    const hasBg = Boolean(o.summary_background_url && String(o.summary_background_url).trim());
    return {
        version: SUMMARY_RENDER_SPEC.version,
        page_id: SUMMARY_RENDER_SPEC.page_id,
        canvas: { ...SUMMARY_RENDER_SPEC.canvas },
        padding_px: SUMMARY_RENDER_SPEC.padding_px,
        font: { ...SUMMARY_RENDER_SPEC.font },
        pdf: { ...SUMMARY_RENDER_SPEC.pdf },
        branding: {
            chart_color: chart,
            /** для совместимости с ЛК, совпадает с chart_color */
            accent_color: chart,
            uses_custom_summary_background: hasBg,
            uses_custom_logo: hasLogo,
            stock_logo_repo_relative_path: GLOBAL_DEFAULTS.stockLogoPath,
            stock_ai_avatar_repo_relative_path: GLOBAL_DEFAULTS.stockAiAvatarPath,
            goal_cards_repo_relative_dir: GOAL_CARDS_DIR,
            goal_card_file_hint:
                'Имя файла = goal_type (PENSION, INVESTMENT, OTHER, …), расширение .png/.jpg/.webp; иначе DEFAULT.png',
        },
    };
}

function findGoalCardImagePath(goalType, rootDir) {
    const base = path.join(rootDir, GOAL_CARDS_DIR);
    const raw = goalType != null ? String(goalType).trim() : '';
    const safe = raw.replace(/[^A-Za-z0-9_]/g, '') || 'DEFAULT';
    const candidates = [safe, 'DEFAULT'];
    const exts = ['.png', '.jpg', '.jpeg', '.webp'];
    for (const name of candidates) {
        for (const ext of exts) {
            const p = path.join(base, `${name}${ext}`);
            if (fs.existsSync(p)) return p;
        }
    }
    const legacy = path.join(rootDir, 'assets/reports/summary/goal-default.png');
    return fs.existsSync(legacy) ? legacy : null;
}

/**
 * Фон карточки цели: сначала ищем файл по типу цели, потом DEFAULT.
 * @param {string} goalType — как в API: PENSION, LIFE, FIN_RESERVE, INVESTMENT, OTHER, …
 * @param {boolean} [inlineLocalAssets]
 */
function resolveGoalCardImageSrc(goalType, rootDir, inlineLocalAssets = false) {
    const p = findGoalCardImagePath(goalType, rootDir);
    if (!p) return '';
    if (inlineLocalAssets) {
        try {
            return localFileToDataUrl(p);
        } catch {
            return pathToFileURL(p).href;
        }
    }
    return pathToFileURL(p).href;
}

function renderProtectionCardFinReserve(goal, rootDir, inlineLocalAssets) {
    const s = goal.summary || {};
    const img = escapeHtml(resolveGoalCardImageSrc('FIN_RESERVE', rootDir, inlineLocalAssets));
    const title = escapeHtml(goal.goal_name || 'Финансовый резерв');
    const cap = formatMoneyRu(s.initial_capital);
    const mon = formatMoneyRu(s.monthly_replenishment);
    return `<div class="goal-card">
      <img class="goal-card__bg" src="${img}" alt="" />
      <div class="goal-card__footer">
        <div class="glass">
          <h3 class="goal-card__title">${title}</h3>
          <div class="goal-card__rows">
            <div class="row"><span>Капитал:</span><span class="fw-600">${escapeHtml(cap)}</span></div>
            <div class="row"><span>Пополнение:</span><span class="fw-600">${escapeHtml(mon)}/мес</span></div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderProtectionCardLife(goal, rootDir, inlineLocalAssets) {
    const risks = goal.details?.risks;
    const list = Array.isArray(risks) ? risks.slice(0, 2) : [];
    const img = escapeHtml(resolveGoalCardImageSrc('LIFE', rootDir, inlineLocalAssets));
    const title = escapeHtml(goal.goal_name || 'Защита жизни');
    const rows = list
        .map((r) => {
            const lim = Number(r.limit_amount);
            const m = Number.isFinite(lim) ? `${(lim / 1_000_000).toFixed(1)}М ₽` : '—';
            return `<div class="row"><span>${escapeHtml(r.risk_name || '')}:</span><span class="fw-600">${escapeHtml(
                m
            )}</span></div>`;
        })
        .join('');
    return `<div class="goal-card">
      <img class="goal-card__bg" src="${img}" alt="" />
      <div class="goal-card__footer">
        <div class="glass">
          <h3 class="goal-card__title">${title}</h3>
          <div class="goal-card__rows">${rows || '<div class="row"><span>—</span></div>'}</div>
        </div>
      </div>
    </div>`;
}

function renderMainGoalCard(goal, rootDir, inlineLocalAssets) {
    const gt = goal.goal_type || 'OTHER';
    const img = escapeHtml(resolveGoalCardImageSrc(gt, rootDir, inlineLocalAssets));
    const title = escapeHtml(goal.goal_name || 'Цель');
    const months = Number(goal.summary?.target_months ?? goal.summary?.term_months);
    const years = Number.isFinite(months) ? Math.max(1, Math.round(months / 12)) : '—';
    let rightLabel = 'Стоимость:';
    let rightVal = '—';
    if (gt === 'PENSION') {
        rightLabel = 'Желаемый доход:';
        const p = goal.summary?.projected_pension_monthly_present;
        rightVal = Number.isFinite(Number(p)) ? `${formatMoneyRu(p)}/мес` : '—';
    } else {
        const t = Number(goal.summary?.target_amount_initial ?? goal.details?.target_amount_initial);
        rightVal =
            Number.isFinite(t) && t > 0 ? `${(t / 1_000_000).toFixed(1)}М ₽` : '—';
    }
    return `<div class="goal-card goal-card--tall">
      <img class="goal-card__bg" src="${img}" alt="" />
      <div class="goal-card__footer">
        <div class="glass">
          <h3 class="goal-card__title">${title}</h3>
          <div class="goal-card__rows">
            <div class="row"><span>Срок:</span><span class="fw-600">${escapeHtml(String(years))} лет</span></div>
            <div class="row"><span>${escapeHtml(rightLabel)}</span><span class="fw-600">${rightVal}</span></div>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * @param {Object} options
 * @param {Object} [options.reportPayload] — как investment-summary.json или фрагмент ответа GET /reports (goals / goals_detailed + summary / overall_plan)
 * @param {{ name?: string, age?: number|string, income?: string, currentCapital?: string }} options.clientInfo — уже отформатированные строки для карточек (доход / капитал)
 * @param {string} [options.aiIntroHtml] — готовый HTML параграфа; иначе шаблон от данных
 * @param {string} [options.summaryLogoUrl] — https или путь от корня репо
 * @param {string} [options.summaryBackgroundUrl] — фон страницы (https или путь)
 * @param {string} [options.summaryChartColor] — #RRGGBB (графики + акцент заголовков секций)
 * @param {string} [options.summaryAccentColor] — устар., то же что chart
 * @param {string} [options.fontPath] — TTF
 * @param {boolean} [options.inlineLocalAssets] — true для превью в браузере ЛК: картинки/шрифт с диска как data:, не file://
 */
function buildReportSummaryOverviewHtml(options = {}) {
    const root = path.join(__dirname, '../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const chartColor = sanitizeSummaryChartColor(
        options.summaryChartColor ?? options.summaryAccentColor
    );
    const fontPath =
        options.fontPath || path.join(root, SUMMARY_RENDER_SPEC.pdf.default_font_repo_relative_path);
    const fontPathResolved = path.resolve(fontPath);
    let fontUrl = pathToFileURL(fontPathResolved).href;
    if (inlineLocalAssets && fs.existsSync(fontPathResolved)) {
        try {
            fontUrl = localFileToDataUrl(fontPathResolved);
        } catch {
            /* оставляем file:// */
        }
    }

    const logoRef =
        options.summaryLogoUrl && String(options.summaryLogoUrl).trim()
            ? options.summaryLogoUrl
            : GLOBAL_DEFAULTS.stockLogoPath;
    const logoSrc = escapeHtml(resolveAssetSrc(logoRef, root, inlineLocalAssets));

    const avatarRef = GLOBAL_DEFAULTS.stockAiAvatarPath;
    const avatarSrc = escapeHtml(resolveAssetSrc(avatarRef, root, inlineLocalAssets));

    const customBg =
        options.summaryBackgroundUrl && String(options.summaryBackgroundUrl).trim()
            ? String(options.summaryBackgroundUrl).trim()
            : '';
    const bgSrc = customBg ? escapeHtml(resolveAssetSrc(customBg, root, inlineLocalAssets)) : '';

    const payload = options.reportPayload || {};
    const goals = extractGoals(payload);
    const financialReserveGoal = goals.find((g) => g.goal_type === 'FIN_RESERVE');
    const lifeProtectionGoal = goals.find((g) => g.goal_type === 'LIFE');
    const mainGoals = goals.filter(
        (g) => g.goal_type !== 'FIN_RESERVE' && g.goal_type !== 'LIFE'
    );
    const firstPageGoals = mainGoals.slice(0, 2);

    const totalMonthly = extractTotalMonthlyReplenishment(payload);
    const totalMonthlyFormatted = formatMoneyRu(totalMonthly);

    const ci = options.clientInfo || {};
    const clientName = ci.name != null ? String(ci.name) : '';
    const clientAge = ci.age != null ? String(ci.age) : '—';
    const income = ci.income != null ? String(ci.income) : '—';
    const capital = ci.currentCapital != null ? String(ci.currentCapital) : '—';

    const aiBlock =
        options.aiIntroHtml && String(options.aiIntroHtml).trim()
            ? options.aiIntroHtml
            : buildDefaultAiIntro(clientName.split(/\s+/)[0] || clientName, totalMonthlyFormatted);

    const protectionHtml = [];
    if (financialReserveGoal) {
        protectionHtml.push(renderProtectionCardFinReserve(financialReserveGoal, root, inlineLocalAssets));
    }
    if (lifeProtectionGoal) {
        protectionHtml.push(renderProtectionCardLife(lifeProtectionGoal, root, inlineLocalAssets));
    }
    const protectionSection =
        protectionHtml.length > 0
            ? `<section class="section">
        <h2 class="h2" style="border-bottom-color: ${escapeHtml(chartColor)}">Финансовая защита</h2>
        <div class="grid-2">${protectionHtml.join('')}</div>
      </section>`
            : '';

    const mainGoalsHtml =
        firstPageGoals.length > 0
            ? `<section class="section section--grow">
        <h2 class="h2" style="border-bottom-color: ${escapeHtml(chartColor)}">Основные цели</h2>
        <div class="grid-2">${firstPageGoals.map((g) => renderMainGoalCard(g, root, inlineLocalAssets)).join('')}</div>
      </section>`
            : '';

    const S = SUMMARY_RENDER_SPEC;
    const pad = S.padding_px;
    const bgBlock = bgSrc
        ? `<div class="page__bg" aria-hidden="true">
      <img class="page__bg-img" src="${bgSrc}" alt="" />
      <div class="page__bg-overlay"></div>
    </div>`
        : `<div class="page__bg page__bg--fallback" aria-hidden="true"></div>`;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Сводная информация</title>
  <style>
    @font-face {
      font-family: 'ReportSummary';
      src: url('${fontUrl}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @page {
      size: ${S.canvas.width_px}px ${S.canvas.height_px}px;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .fw-600 { font-weight: 600; }
    .page {
      position: relative;
      width: ${S.canvas.width_px}px;
      height: ${S.canvas.height_px}px;
      overflow: hidden;
      padding: ${pad}px;
      font-family: ${S.font.family_stack_css};
      font-size: 14px;
      line-height: 1.45;
      color: #ffffff;
      background: #0f172a;
    }
    .page__bg {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }
    .page__bg--fallback {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #0f172a 100%);
    }
    .page__bg-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .page__bg-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        135deg,
        rgba(15, 23, 42, 0.58) 0%,
        rgba(30, 41, 59, 0.5) 45%,
        rgba(15, 23, 42, 0.62) 100%
      );
    }
    .page__inner {
      position: relative;
      z-index: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .logo-row { margin-bottom: 22px; }
    .logo-row img { height: 40px; display: block; }
    .ai-panel {
      display: flex;
      gap: 14px;
      margin-bottom: 20px;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(15, 23, 42, 0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .ai-panel__avatar {
      flex-shrink: 0;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255,255,255,0.85);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .ai-panel__text { font-size: 13px; color: #ffffff; }
    .client-panel {
      margin-bottom: 18px;
      padding: 14px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(15, 23, 42, 0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .client-panel__title {
      font-size: 16px;
      font-weight: 700;
      margin: 0 0 12px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.22);
      color: #ffffff;
    }
    .client-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .client-cell {
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.22);
      background: rgba(15, 23, 42, 0.35);
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .client-cell__label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.72);
      margin-bottom: 4px;
    }
    .client-cell__val { font-weight: 600; color: #ffffff; font-size: 13px; }
    .section { margin-bottom: 14px; }
    .section--grow { flex: 1; min-height: 0; }
    .h2 {
      font-size: 16px;
      font-weight: 700;
      color: #e2e8f0;
      margin: 0 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 2px solid;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .goal-card {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      height: 154px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.25);
    }
    .goal-card--tall { height: 186px; }
    .goal-card__bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .goal-card__footer {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 10px;
    }
    .glass {
      border-radius: 8px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.14);
    }
    .goal-card__title {
      margin: 0 0 6px 0;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 2px 4px rgba(0,0,0,0.75);
    }
    .goal-card__rows { font-size: 12px; }
    .goal-card__rows .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.75);
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="page" data-report-page="summary_overview">
    ${bgBlock}
    <div class="page__inner">
      <div class="logo-row">
        <img src="${logoSrc}" alt="" />
      </div>
      <div class="ai-panel">
        <img class="ai-panel__avatar" src="${avatarSrc}" alt="" />
        <div class="ai-panel__text">${aiBlock}</div>
      </div>
      <div class="client-panel">
        <h2 class="client-panel__title">Информация о клиенте</h2>
        <div class="client-grid">
          <div class="client-cell">
            <div class="client-cell__label">Клиент</div>
            <div class="client-cell__val">${escapeHtml(clientName || '—')}</div>
          </div>
          <div class="client-cell">
            <div class="client-cell__label">Возраст</div>
            <div class="client-cell__val">${escapeHtml(clientAge)}${clientAge !== '—' ? ' лет' : ''}</div>
          </div>
          <div class="client-cell">
            <div class="client-cell__label">Доход</div>
            <div class="client-cell__val">${escapeHtml(income)}</div>
          </div>
          <div class="client-cell">
            <div class="client-cell__label">Текущий капитал</div>
            <div class="client-cell__val">${escapeHtml(capital)}</div>
          </div>
        </div>
      </div>
      ${protectionSection}
      ${mainGoalsHtml}
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
    SUMMARY_RENDER_SPEC,
    GOAL_CARDS_DIR,
    GLOBAL_DEFAULTS,
    buildReportSummaryOverviewHtml,
    buildSummaryLayoutPayload,
    sanitizeSummaryChartColor,
    sanitizeSummaryAccentColor,
    resolveGoalCardImageSrc,
    extractGoals,
    extractTotalMonthlyReplenishment,
    formatMoneyRu,
};
