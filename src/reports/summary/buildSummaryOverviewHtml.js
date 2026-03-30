const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { publicUrlFromKey } = require('../../utils/r2Client');

/**
 * Вторая страница PDF («Сводная информация») — первая A4 из макета Figma PlanOverviewPage
 * (лого, блок ИИ, карточка клиента, фин. защита, до трёх основных целей + диаграммы по целям).
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
/** Общий префикс ключей в R2 после `npm run seed:pdf-goal-cards-r2` — `pdf-report-goal-cards/PENSION.png` и т.д. */
const GOAL_CARDS_R2_PREFIX = 'pdf-report-goal-cards';

/**
 * Расширения картинок целей в R2 (и в assets/goal-cards/).
 * Важно: в прод-контейнере может не быть этих картинок в файловой системе,
 * поэтому резолвим R2 ключ детерминированно без fs.existsSync.
 */
const GOAL_CARD_EXT_BY_TYPE = {
    FIN_RESERVE: 'webp',
    LIFE: 'webp',
    DEFAULT: 'png',
};

/** R2 ключи стоковых ассетов для превью сводной (logo/avatar/font) */
const SUMMARY_STOCK_ASSETS_R2_PREFIX = 'pdf-report-summary-stock-assets';

const GLOBAL_DEFAULTS = {
    /** Акцент секций и будущих диаграмм (пироги и т.д.) */
    summaryChartColor: '#8b5cf6',
    /** Цвет текста на странице */
    summaryTextColor: '#ffffff',
    /** Непрозрачность затемнения фона (0..1) */
    summaryBackgroundOverlayOpacity: 0.58,
    /** от корня репо */
    stockLogoPath: 'assets/reports/summary/stock-logo.png',
    stockAiAvatarPath: 'assets/reports/summary/stock-ai-avatar.png',
};

const DISTRIBUTION_CHART_COLORS = ['#3b82f6', '#6366f1', '#a855f7', '#60a5fa', '#8b5cf6', '#2563eb'];

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

    // 1) Если локально читается и inlineLocalAssets включён — вшиваем data:
    if (inlineLocalAssets && fs.existsSync(abs)) {
        try {
            return localFileToDataUrl(abs);
        } catch {
            // дальше попробуем R2
        }
    }

    // 2) Если file:// отдавать нельзя (iframe srcDoc на фронте) — фолбэк на публичный CDN из R2
    const basename = path.basename(abs);
    const r2Key = `${SUMMARY_STOCK_ASSETS_R2_PREFIX}/${basename}`;
    const pub = publicUrlFromKey(r2Key);
    if (pub) return pub;

    // 3) Последняя попытка: file:// (для server-side PDF-рендера может быть ок)
    if (fs.existsSync(abs)) return pathToFileURL(abs).href;
    return '';
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
    const text = sanitizeHexColor(o.summary_text_color, GLOBAL_DEFAULTS.summaryTextColor);
    const line = sanitizeHexColor(o.summary_line_color, chart);
    const overlayOpacity = sanitizeOpacity(
        o.summary_background_overlay_opacity,
        GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity
    );
    const darknessPercent = sanitizePercent(
        o.summary_background_darkness_percent,
        Math.round(overlayOpacity * 100)
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
            text_color: text,
            line_color: line,
            background_overlay_opacity: overlayOpacity,
            /** Рекомендуемый формат для UI-слайдера: 0..100 */
            background_darkness_percent: darknessPercent,
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
 * Путь к картинке карточки цели от корня репозитория (слэши `/`), для JSON на фронт/PDF.
 * Логика имён та же, что у HTML-сводной: `{GOAL_TYPE}.{png|jpg|jpeg|webp}` → иначе `DEFAULT.*`.
 * @returns {string|null}
 */
function getGoalCardImageRepoRelative(goalType, rootDir) {
    const abs = findGoalCardImagePath(goalType, rootDir);
    if (!abs) return null;
    const root = path.resolve(rootDir);
    const resolved = path.resolve(abs);
    const rel = path.relative(root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
}

/**
 * Ключ объекта в R2 (имя файла как в репо: PENSION.png, LIFE.webp …).
 * @returns {string|null}
 */
function getGoalCardImageR2Key(goalType, rootDir) {
    const raw = goalType != null ? String(goalType).trim() : '';
    const safe = raw.replace(/[^A-Za-z0-9_]/g, '') || 'DEFAULT';
    const ext = GOAL_CARD_EXT_BY_TYPE[safe.toUpperCase()] || 'png';
    return `${GOAL_CARDS_R2_PREFIX}/${safe}.${ext}`;
}

const GOAL_CARD_FILE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/**
 * Манифест картинок карточек целей для ЛК агента (превью макета). Редактирование в ЛК не предусмотрено.
 * @param {string} rootDir — корень репозитория
 */
function buildGoalCardAssetsForAgentLK(rootDir) {
    const dir = path.join(rootDir, GOAL_CARDS_DIR);
    const cards = [];
    try {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            const names = fs
                .readdirSync(dir)
                .filter((n) => GOAL_CARD_FILE_EXT.has(path.extname(n).toLowerCase()));
            for (const name of names.sort()) {
                const stem = path.basename(name, path.extname(name));
                const r2Key = `${GOAL_CARDS_R2_PREFIX}/${name}`;
                const pub = publicUrlFromKey(r2Key);
                cards.push({
                    goal_type: stem,
                    filename: name,
                    r2_object_key: r2Key,
                    public_url: pub || null,
                    repo_relative_path: `${GOAL_CARDS_DIR}/${name}`.replace(/\\/g, '/'),
                });
            }
        }
    } catch {
        /* пустой cards */
    }
    return {
        version: 1,
        editable: false,
        r2_key_prefix: GOAL_CARDS_R2_PREFIX,
        directory_repo_relative: GOAL_CARDS_DIR,
        hint:
            'Общие иллюстрации по типу цели (имя файла = goal_type). В ЛК не меняются; для превью используйте public_url (после seed в R2).',
        cards,
    };
}

/**
 * Фон карточки цели: сначала ищем файл по типу цели, потом DEFAULT.
 * @param {string} goalType — как в API: PENSION, LIFE, FIN_RESERVE, INVESTMENT, OTHER, …
 * @param {boolean} [inlineLocalAssets]
 */
function resolveGoalCardImageSrc(goalType, rootDir, inlineLocalAssets = false) {
    const r2Key = getGoalCardImageR2Key(goalType, rootDir);
    if (r2Key) {
        const pub = publicUrlFromKey(r2Key);
        if (pub) return pub;
    }
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
    const goalNameRaw = String(goal.goal_name || '');
    const normalizedGoalName = goalNameRaw.toLowerCase().replace(/ё/g, 'е');
    const isSaveAndGrowGoal =
        gt === 'INVESTMENT' ||
        (/сохранить/.test(normalizedGoalName) && /(преумнож|приумнож)/.test(normalizedGoalName));
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
    } else if (isSaveAndGrowGoal) {
        rightLabel = 'Капитал:';
        const c = Number(goal.summary?.initial_capital ?? goal.smart_initial_capital);
        // Для моков иногда initial_capital отсутствует — даем читаемый fallback в превью.
        rightVal = Number.isFinite(c) && c > 0 ? formatMoneyRu(c) : '1 500 000 ₽';
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

function goalInitialMonthly(g) {
    const initial = Number(g?.summary?.initial_capital ?? g?.smart_initial_capital ?? 0) || 0;
    const monthly = Number(g?.summary?.monthly_replenishment ?? 0) || 0;
    return { initial, monthly };
}

function allocatePercentages(amounts) {
    const total = amounts.reduce((s, x) => s + x, 0);
    if (total <= 0) return amounts.map(() => 0);
    const exact = amounts.map((a) => (100 * a) / total);
    const floor = exact.map((x) => Math.floor(x));
    let rem = 100 - floor.reduce((s, x) => s + x, 0);
    const order = exact
        .map((x, i) => ({ i, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);
    const out = [...floor];
    for (let k = 0; k < rem; k++) out[order[k % order.length].i]++;
    return out;
}

function buildDistributionChartHtml(title, goals, amounts, totalDisplay) {
    if (!Array.isArray(goals) || goals.length === 0) return '';
    const perc = allocatePercentages(amounts);
    let acc = 0;
    const pieStops = goals
        .map((_, i) => {
            const color = DISTRIBUTION_CHART_COLORS[i % DISTRIBUTION_CHART_COLORS.length];
            const from = acc;
            acc += perc[i];
            return `${color} ${from}% ${acc}%`;
        })
        .join(', ');

    const legend = goals
        .map((g, i) => {
            const color = DISTRIBUTION_CHART_COLORS[i % DISTRIBUTION_CHART_COLORS.length];
            const name = escapeHtml(g.goal_name || '—');
            return `<li class="dist-legend__item">
              <span class="dist-legend__dot" style="background:${color}"></span>
              <span>${name} - ${perc[i]}%</span>
            </li>`;
        })
        .join('');

    return `<article class="dist-card">
      <h3 class="dist-card__title">${escapeHtml(title)}</h3>
      <div class="dist-pie" style="background: conic-gradient(${pieStops})" aria-hidden="true"></div>
      <ul class="dist-legend">${legend}</ul>
      <div class="dist-total">Всего: ${escapeHtml(totalDisplay)}</div>
    </article>`;
}

/**
 * @param {Object} options
 * @param {Object} [options.reportPayload] — как investment-summary.json или фрагмент ответа GET /reports (goals / goals_detailed + summary / overall_plan)
 * @param {{ name?: string, age?: number|string, income?: string, currentCapital?: string }} options.clientInfo — уже отформатированные строки для карточек (доход / капитал)
 * @param {string} [options.aiIntroHtml] — готовый HTML параграфа; иначе шаблон от данных
 * @param {string} [options.summaryLogoUrl] — https или путь от корня репо
 * @param {string} [options.summaryBackgroundUrl] — фон страницы (https или путь)
 * @param {string} [options.summaryChartColor] — #RRGGBB (графики + акцент заголовков секций)
 * @param {string} [options.summaryTextColor] — #RRGGBB (основной цвет текста на странице)
 * @param {string} [options.summaryLineColor] — #RRGGBB (линии/бордеры секций; по умолчанию summaryChartColor)
 * @param {number|string} [options.summaryBackgroundDarknessPercent] — затемнение фона 0..100 (шаг 1)
 * @param {number|string} [options.summaryBackgroundOverlayOpacity] — затемнение фона 0..1
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
    const textColor = sanitizeHexColor(options.summaryTextColor, GLOBAL_DEFAULTS.summaryTextColor);
    const lineColor = sanitizeHexColor(options.summaryLineColor, chartColor);
    const darknessPercent = sanitizePercent(
        options.summaryBackgroundDarknessPercent,
        Math.round(
            sanitizeOpacity(
                options.summaryBackgroundOverlayOpacity,
                GLOBAL_DEFAULTS.summaryBackgroundOverlayOpacity
            ) * 100
        )
    );
    const overlayOpacity = darknessPercent / 100;
    const fontPath =
        options.fontPath || path.join(root, SUMMARY_RENDER_SPEC.pdf.default_font_repo_relative_path);
    const fontPathResolved = path.resolve(fontPath);
    let fontUrl = pathToFileURL(fontPathResolved).href;
    if (inlineLocalAssets && fs.existsSync(fontPathResolved)) {
        try {
            fontUrl = localFileToDataUrl(fontPathResolved);
        } catch {
            /* попробуем R2 ниже */
        }
    }

    // 2) Если inline не получилось — пробуем публичный URL шрифта из R2
    if (inlineLocalAssets) {
        const fontBase = path.basename(fontPathResolved);
        const r2Key = `${SUMMARY_STOCK_ASSETS_R2_PREFIX}/${fontBase}`;
        const pub = publicUrlFromKey(r2Key);
        if (pub) fontUrl = pub;
    }

    // Для превью в ЛК фронт кладёт HTML в `iframe srcDoc`. В таком случае CSP родителя
    // может запрещать `data:` для `img-src`/`font-src`, и base64-картинки не отобразятся.
    // meta CSP внутри документа гарантирует разрешение нужных источников.
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
    const firstPageGoals = mainGoals.slice(0, 3);

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
        <h2 class="h2" style="border-bottom-color: ${escapeHtml(lineColor)}">Финансовая защита</h2>
        <div class="grid-2">${protectionHtml.join('')}</div>
      </section>`
            : '';

    const mainGoalsHtml =
        firstPageGoals.length > 0
            ? `<section class="section">
        <h2 class="h2" style="border-bottom-color: ${escapeHtml(lineColor)}">Основные цели</h2>
        <div class="grid-main-goals">${firstPageGoals
            .map((g) => renderMainGoalCard(g, root, inlineLocalAssets))
            .join('')}</div>
      </section>`
            : '';

    const initialAmounts = goals.map((g) => goalInitialMonthly(g).initial);
    const monthlyAmounts = goals.map((g) => goalInitialMonthly(g).monthly);
    const totalInitialAmount = Math.round(initialAmounts.reduce((s, x) => s + x, 0) * 100) / 100;
    const totalMonthlyAmount = Math.round(monthlyAmounts.reduce((s, x) => s + x, 0) * 100) / 100;
    const hasDistribution =
        goals.length > 0 && (totalInitialAmount > 0 || totalMonthlyAmount > 0);
    const distributionSection = hasDistribution
        ? `<section class="section">
        <div class="dist-grid">
          ${buildDistributionChartHtml(
              'Распределение начального капитала по целям',
              goals,
              initialAmounts,
              formatMoneyRu(totalInitialAmount)
          )}
          ${buildDistributionChartHtml(
              'Распределение ежемесячных пополнений по целям',
              goals,
              monthlyAmounts,
              `${formatMoneyRu(totalMonthlyAmount)}/мес`
          )}
        </div>
      </section>`
        : '';

    const S = SUMMARY_RENDER_SPEC;
    const pad = S.padding_px;
    const bgBlock = bgSrc
        ? `<div class="page__bg" aria-hidden="true">
      <img class="page__bg-img" src="${bgSrc}" alt="" />
      <div class="page__bg-overlay"></div>
    </div>`
        : `<div class="page__bg page__bg--fallback" aria-hidden="true"></div>
    <div class="page__bg-overlay" aria-hidden="true"></div>`;

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  ${cspMeta}
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
      padding: 20px ${pad}px ${pad}px ${pad}px;
      font-family: ${S.font.family_stack_css};
      font-size: 14px;
      line-height: 1.45;
      color: ${textColor};
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
      z-index: 0;
      pointer-events: none;
      background: linear-gradient(
        135deg,
        rgba(15, 23, 42, ${overlayOpacity}) 0%,
        rgba(30, 41, 59, ${Math.max(0, overlayOpacity - 0.08)}) 45%,
        rgba(15, 23, 42, ${Math.min(1, overlayOpacity + 0.04)}) 100%
      );
    }
    .page__inner {
      position: relative;
      z-index: 1;
      height: 100%;
      overflow: hidden;
    }
    .ai-panel {
      display: flex;
      gap: 14px;
      margin-bottom: 10px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(15, 23, 42, 0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .ai-panel__avatar {
      flex-shrink: 0;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255,255,255,0.85);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .ai-panel__text { font-size: 11px; line-height: 1.35; color: ${textColor}; }
    .client-panel {
      margin-bottom: 10px;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(15, 23, 42, 0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .client-panel__title {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 8px 0;
      padding-bottom: 5px;
      border-bottom: 1px solid ${lineColor};
      color: ${textColor};
    }
    .client-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .client-cell {
      padding: 7px;
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
    .client-cell__val { font-weight: 600; color: ${textColor}; font-size: 11px; }
    .section { margin-bottom: 8px; }
    .h2 {
      font-size: 14px;
      font-weight: 700;
      color: ${textColor};
      margin: 0 0 7px 0;
      padding-bottom: 4px;
      border-bottom: 2px solid;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .grid-main-goals {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .goal-card {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      height: 130px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.25);
    }
    .goal-card--tall { height: 122px; }
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
      left: 6px;
      right: 6px;
      bottom: 6px;
    }
    .glass {
      border-radius: 7px;
      padding: 6px;
      border: 1px solid rgba(255,255,255,0.34);
      background: rgba(15, 23, 42, 0.52);
    }
    .goal-card__title {
      margin: 0 0 4px 0;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 2px 4px rgba(0,0,0,0.75);
    }
    .goal-card__rows { font-size: 9px; }
    .goal-card__rows .row {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.75);
      margin-top: 1px;
    }
    .dist-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 0;
    }
    .dist-card {
      border-radius: 8px;
      padding: 8px;
      border: 1px solid ${lineColor};
      background: rgba(15, 23, 42, 0.42);
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
      min-height: 176px;
    }
    .dist-card__title {
      margin: 0 0 5px 0;
      text-align: center;
      font-size: 11px;
      line-height: 1.3;
      font-weight: 700;
      color: ${textColor};
    }
    .dist-pie {
      width: 86px;
      height: 86px;
      display: block;
      aspect-ratio: 1 / 1;
      margin: 0 auto 5px auto;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.9);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
    }
    .dist-legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 10px;
      font-size: 9px;
      line-height: 1.25;
      color: ${textColor};
    }
    .dist-legend__item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
    }
    .dist-legend__dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.5);
    }
    .dist-total {
      margin-top: 6px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      color: ${textColor};
    }
  </style>
</head>
<body>
  <div class="page" data-report-page="summary_overview">
    ${bgBlock}
    <div class="page__inner">
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
      ${distributionSection}
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
    SUMMARY_RENDER_SPEC,
    GOAL_CARDS_DIR,
    GOAL_CARDS_R2_PREFIX,
    GLOBAL_DEFAULTS,
    getGoalCardImageRepoRelative,
    getGoalCardImageR2Key,
    buildGoalCardAssetsForAgentLK,
    buildReportSummaryOverviewHtml,
    buildSummaryLayoutPayload,
    sanitizeSummaryChartColor,
    sanitizeSummaryAccentColor,
    resolveGoalCardImageSrc,
    extractGoals,
    extractTotalMonthlyReplenishment,
    formatMoneyRu,
};
