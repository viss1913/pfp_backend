const fs = require('fs');
const path = require('path');
const db = require('../../config/database');
const aiService = require('../../services/aiService');
const { resolveGoalTemplateFile, resolveOtherGoalTemplateFile } = require('./finamGoalTemplates');
const {
    orderFinamGoalsForPdf,
    applyFinamPage4TargetsFromReport,
    splitFinamPage4IntoStandalonePages,
    applyFinamPortfolioFinalPage,
    applyFinamTaxPlanningPage,
} = require('./finamPdfPageAppliers');

const FINAM_PROJECT_ID = 14;
const TEMPLATE_DIR = __dirname;
/** Корень репозитория (от `src/reports/finam`). */
const FINAM_REPO_ROOT = path.join(__dirname, '..', '..', '..');

const FINAM_GOAL_CARD_PLACEHOLDER_MAP = {
    'goal-reserve.webp': 'reserve.webp',
    'goal-life.webp': 'lifeinsurance.webp',
    'goal-apartment.webp': 'kvartira.webp',
    'goal-education.webp': 'obrazovanie_rebyonka.webp',
    'goal-house.webp': 'zagorodnayanedvizhimost.webp',
    'goal-pension.webp': 'gospensiya.webp',
    'goal-grow.webp': 'sohranit__i_preumnozhit.webp',
    'goal-rent.webp': 'drugoe.webp',
};

function imageDataUrlFromLocalFile(absPath) {
    try {
        if (!fs.existsSync(absPath)) return null;
        const ext = path.extname(absPath).toLowerCase();
        const mime =
            ext === '.webp'
                ? 'image/webp'
                : ext === '.png'
                  ? 'image/png'
                  : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : 'application/octet-stream';
        const b64 = fs.readFileSync(absPath).toString('base64');
        return `data:${mime};base64,${b64}`;
    } catch {
        return null;
    }
}

/**
 * Подменяет относительные пути к goal-cards и плейсхолдеры на data URL — иначе в PDF/srcdoc картинки не грузятся.
 */
function inlineFinamRasterImages(html, repoRoot = FINAM_REPO_ROOT) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    out = out.replace(
        /src="\.\.\/\.\.\/\.\.\/assets\/reports\/goal-cards\/([^"]+)"/gi,
        (match, filename) => {
            const normalized = String(filename).replace(/\\/g, '/');
            const abs = path.join(repoRoot, 'assets', 'reports', 'goal-cards', path.basename(normalized));
            const dataUrl = imageDataUrlFromLocalFile(abs);
            return dataUrl ? `src="${dataUrl}"` : match;
        }
    );
    // Инлайнинг картинок для Плана действий (Action Plan) из src/reports/finam/assets/todo
    out = out.replace(
        /src="\.\/assets\/todo\/([^"]+)"/gi,
        (match, filename) => {
            const abs = path.join(__dirname, 'assets', 'todo', filename);
            const dataUrl = imageDataUrlFromLocalFile(abs);
            return dataUrl ? `src="${dataUrl}"` : match;
        }
    );
    out = out.replace(
        /<div class="life-hero-image">\s*<div class="ph">[\s\S]*?<\/div>\s*<\/div>/i,
        () => {
            const abs = path.join(repoRoot, 'assets', 'reports', 'goal-cards', 'lifeinsurance.webp');
            const dataUrl = imageDataUrlFromLocalFile(abs);
            if (!dataUrl) {
                return '<div class="life-hero-image"><div class="ph">./assets/<br>goal-life.webp<br><br>LIFE</div></div>';
            }
            return `<div class="life-hero-image"><img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>`;
        }
    );
    out = out.replace(
        /<div class="goal-image">\s*<div class="goal-image-placeholder">\.\/assets\/<br>([^<]+)<\/div>\s*<\/div>/gi,
        (match, fnameRaw) => {
            const key = String(fnameRaw).trim();
            const file = FINAM_GOAL_CARD_PLACEHOLDER_MAP[key] || 'drugoe.webp';
            const abs = path.join(repoRoot, 'assets', 'reports', 'goal-cards', file);
            const dataUrl = imageDataUrlFromLocalFile(abs);
            if (!dataUrl) return match;
            return `<div class="goal-image"><img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:4px;"/></div>`;
        }
    );
    return out;
}

function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function comonPublicBaseUrl() {
    return (process.env.COMON_BASE_URL || 'https://www.comon.ru').replace(/\/$/, '');
}

function resolveComonStrategyPageUrl(row) {
    if (!row || typeof row !== 'object') return '';
    const idNum = row.id != null ? Number(row.id) : NaN;
    const base = comonPublicBaseUrl();
    const pick = (v) => (v != null && String(v).trim() ? String(v).trim() : '');
    let u = pick(row.url);
    if (!u) u = pick(row.pageUrl);
    if (!u) u = pick(row.link);
    if (u.startsWith('/')) u = `${base}${u}`;
    if (!u && Number.isFinite(idNum) && idNum > 0) u = `${base}/strategies/${idNum}`;
    return u;
}

function formatComonPercent(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}% / 12 мес`;
}

function formatComonMinSum(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 'Мин. вход: —';
    return `Мин. вход: ${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function buildFinamComonAutofollowCardsHtml(report) {
    const showcase = report?.comon_showcase && typeof report.comon_showcase === 'object' ? report.comon_showcase : null;
    if (!showcase || showcase.error) {
        return `<article class="strategy-card"><p class="strategy-desc">Каталог стратегий временно недоступен. Попробуйте позже.</p></article>`;
    }
    const items = Array.isArray(showcase.items) ? showcase.items.slice(0, 6) : [];
    if (items.length === 0) {
        return `<article class="strategy-card"><p class="strategy-desc">Подходящие стратегии пока не найдены.</p></article>`;
    }
    return items
        .map((it) => {
            const title = escapeHtml(it?.name || 'Стратегия');
            const desc = escapeHtml(
                it?.author ? `Автор стратегии: ${String(it.author)}` : 'Актуальная стратегия автоследования на платформе Comon.'
            );
            const minSum = escapeHtml(formatComonMinSum(it?.min_sum));
            const y = escapeHtml(formatComonPercent(it?.profit_365_days_percent));
            const rawUrl = resolveComonStrategyPageUrl(it);
            const safeUrl = escapeHtml(rawUrl);
            const linkHtml = safeUrl
                ? `<a class="link-line" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}">Смотреть на Comon</a>`
                : '<span class="link-line link-line--disabled">Ссылка недоступна</span>';
            return `<article class="strategy-card">
        <h3 class="strategy-title">${title}</h3>
        <p class="strategy-desc">${desc}</p>
        <div class="chip-row">
          <span class="chip">${minSum}</span>
          <span class="chip chip--yield">${y}</span>
        </div>
        ${linkHtml}
      </article>`;
        })
        .join('\n');
}

function applyFinamActionPlanPage(html, report) {
    if (!html || typeof html !== 'string') return html;
    // Пока что страница статичная, но тут можно будет подставлять динамические ссылки
    return html;
}

function applyFinamComonAutofollowPage(html, report) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    out = out.replace(
        /<section class="cards-grid" aria-label="Карточки стратегий автоследования">[\s\S]*?<\/section>/,
        `<section class="cards-grid" aria-label="Карточки стратегий автоследования">\n${buildFinamComonAutofollowCardsHtml(
            report
        )}\n    </section>`
    );
    const disclaimer = report?.comon_showcase?.disclaimer_ru;
    if (disclaimer && String(disclaimer).trim()) {
        out = out.replace(
            /<p class="disclaimer">[\s\S]*?<\/p>/,
            `<p class="disclaimer">${escapeHtml(String(disclaimer).trim())}</p>`
        );
    }
    return out;
}

function toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function toMonthStartIso(dateLike) {
    const d = dateLike ? new Date(dateLike) : new Date();
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function addMonths(isoDate, monthsToAdd) {
    const d = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + monthsToAdd);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function formatMoney(value) {
    const n = toNum(value);
    return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} руб.`;
}

async function readTemplate(fileName) {
    const abs = path.join(TEMPLATE_DIR, fileName);
    return fs.promises.readFile(abs, 'utf-8');
}

function formatMoneyValue(value) {
    return `${Math.round(toNum(value)).toLocaleString('ru-RU')} ₽`;
}

function formatRubValue(value) {
    return `${Math.round(toNum(value)).toLocaleString('ru-RU')} руб.`;
}

function formatIntValue(value) {
    return Math.round(toNum(value)).toLocaleString('ru-RU');
}

function formatCompactMoneyWithSpan(value) {
    const n = Math.max(0, toNum(value));
    if (n >= 1_000_000) {
        const mln = n / 1_000_000;
        return `${mln.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span> млн ₽</span>`;
    }
    return `${Math.round(n).toLocaleString('ru-RU')}<span> ₽</span>`;
}

function formatPercentValue(value) {
    const n = toNum(value);
    if (n <= 0) return '—';
    return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function riskProfileLabelRu(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const norm = raw.toUpperCase();
    if (norm === 'CONSERVATIVE') return 'Консервативный';
    if (norm === 'BALANCED') return 'Сбалансированный';
    if (norm === 'AGGRESSIVE') return 'Агрессивный';
    return raw;
}

function computeGoalFacts(goal) {
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    const schedule = Array.isArray(details?.monthly_schedule) ? details.monthly_schedule : [];
    const initial = toNum(summary.initial_capital ?? details.initial_capital);
    const monthly = toNum(
        summary.monthly_replenishment ??
            details.monthly_replenishment ??
            (String(goal?.goal_type || '').toUpperCase() === 'LIFE' ? toNum(details.annual_premium) / 12 : 0)
    );
    const months = Math.max(0, Math.round(toNum(details.term_months ?? summary.target_months ?? summary.term_months)));
    const totalCapital = toNum(
        summary.projected_capital_at_end ??
            summary.projected_capital_at_retirement ??
            summary.total_capital_at_end ??
            summary.target_amount_future ??
            summary.expected_cash_value ??
            summary.target_amount_initial
    );
    const totalTax = toNum(summary.total_tax_benefit ?? details.total_tax_deductions ?? details.total_tax_refund);
    const totalCofin = toNum(summary.total_cofinancing ?? details.total_cofinancing ?? details.total_cofinancing_nominal);
    const targetToday = toNum(summary.target_amount_initial ?? details.target_amount_initial ?? goal?.target_amount);
    const targetFuture = toNum(summary.target_amount_future ?? details.target_amount_future ?? totalCapital);
    const inflationRate = toNum(summary.inflation_rate ?? details.inflation_rate ?? goal?.inflation_rate);
    const portfolioYield = toNum(
        summary.accumulation_yield_percent ??
            summary.portfolio_yield_percent ??
            goal?.portfolio_yield_percent ??
            details.portfolio_yield_percent
    );
    const goalRiskProfile =
        goal?.risk_profile ??
        details?.risk_profile ??
        summary?.risk_profile ??
        details?.risk_profile_name ??
        summary?.risk_profile_name ??
        null;

    const firstDate = schedule.find((row) => row?.date)?.date;
    const fallbackYear = firstDate ? new Date(firstDate).getFullYear() : new Date().getFullYear();
    const yearTax = schedule.find((row) => toNum(row?.tax_deduction) > 0)?.date
        ? new Date(schedule.find((row) => toNum(row?.tax_deduction) > 0)?.date).getFullYear()
        : fallbackYear;
    const yearCofin = schedule.find((row) => toNum(row?.cofinancing) > 0)?.date
        ? new Date(schedule.find((row) => toNum(row?.cofinancing) > 0)?.date).getFullYear()
        : fallbackYear + 1;

    const taxYearAmount = schedule.reduce((sum, row) => {
        if (!row?.date) return sum;
        return new Date(row.date).getFullYear() === yearTax ? sum + toNum(row.tax_deduction) : sum;
    }, 0);
    const cofinYearAmount = schedule.reduce((sum, row) => {
        if (!row?.date) return sum;
        return new Date(row.date).getFullYear() === yearCofin ? sum + toNum(row.cofinancing) : sum;
    }, 0);

    const own = Math.max(initial + monthly * months, 0);
    const extra = Math.max(totalCapital - own, 0);
    const targetValue = Math.max(totalCapital, own + extra);

    return {
        initial,
        monthly,
        months,
        totalCapital: targetValue,
        own,
        extra,
        totalTax,
        totalCofin,
        yearTax,
        yearCofin,
        taxYearAmount,
        cofinYearAmount,
        targetToday,
        targetFuture,
        inflationRate,
        portfolioYield,
        riskProfileLabel: riskProfileLabelRu(goalRiskProfile),
    };
}

function sumInstrumentAmounts(list) {
    if (!Array.isArray(list)) return 0;
    return list.reduce((acc, item) => acc + toNum(item?.amount), 0);
}

function resolvePensionRetirementYear(goal) {
    const details = goal?.details || {};
    const summary = goal?.summary || {};
    const fromState = toNum(details?.state_pension?.retirement_year);
    if (fromState > 1900) return Math.round(fromState);
    const years = toNum(details?.state_pension?.years_to_pension ?? summary?.years_to_pension);
    if (years > 0) return new Date().getFullYear() + Math.round(years);
    return null;
}

function formatMillionsShort(value) {
    const n = Math.max(0, toNum(value));
    if (n >= 1_000_000) {
        const mln = n / 1_000_000;
        return `${mln.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} млн ₽`;
    }
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function applyFinBarsScaleByValues(html, values) {
    const nums = values.map((v) => Math.max(0, toNum(v)));
    const max = Math.max(1, ...nums);
    let idx = 0;
    return html.replace(/style="height:\s*\d+(?:\.\d+)?px;"/g, (m) => {
        if (idx >= nums.length) return m;
        const v = nums[idx];
        idx += 1;
        const height = Math.max(16, Math.round((v / max) * 66));
        return `style="height: ${height}px;"`;
    });
}

function parseMoneyFromText(raw) {
    const cleaned = String(raw || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[^\d,.-]/g, '')
        .replace(/\s+/g, '')
        .replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Пересчитывает высоты столбиков в каждом .fin-bar-chart-area по их значениям из .fin-bar-val.
 * Работает для всех goal-шаблонов Финам с одинаковой разметкой столбиков.
 */
function applyFinBarHeightsFromCurrentValues(html) {
    return String(html || '').replace(/<div class="fin-bar-chart-area"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, (areaBlock) => {
        const valMatches = [...areaBlock.matchAll(/<span class="fin-bar-val">([\s\S]*?)<\/span>/g)];
        const values = valMatches.map((m) => Math.max(0, parseMoneyFromText(m[1])));
        if (!values.length) return areaBlock;
        const maxValue = Math.max(1, ...values);

        const styleHeights = [...areaBlock.matchAll(/style="height:\s*(\d+(?:\.\d+)?)px;"/g)].map((m) => Number(m[1]));
        const maxHeightPx = Math.max(66, ...styleHeights.filter((n) => Number.isFinite(n)));
        const minHeightPx = 22;

        let idx = 0;
        return areaBlock.replace(/style="height:\s*\d+(?:\.\d+)?px;"/g, (orig) => {
            if (idx >= values.length) return orig;
            const v = values[idx];
            idx += 1;
            const h = Math.max(minHeightPx, Math.round((v / maxValue) * maxHeightPx));
            return `style="height: ${h}px;"`;
        });
    });
}

function resolveEducationChildName(goal) {
    const details = goal?.details || {};
    const candidates = [
        details?.child_name,
        details?.child?.name,
        details?.child?.first_name,
        details?.children?.[0]?.first_name,
    ].filter(Boolean);
    if (candidates.length) return String(candidates[0]).trim();
    const rawName = String(goal?.goal_name || '').trim();
    const parts = rawName
        .split(/[.,:;|/\\-]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length > 1) {
        const firstWord = parts[1].split(/\s+/).filter(Boolean)[0];
        if (firstWord && firstWord.length >= 2) return firstWord;
    }
    const m = rawName.match(/образован(?:ие)?\s+([а-яa-zё][а-яa-zё-]+)/i);
    if (m && m[1]) return m[1];
    return '';
}

function resolvePrimaryGoalInstrument(goal) {
    const details = goal?.details || {};
    const initial = Array.isArray(details.initial_instruments) ? details.initial_instruments : [];
    const monthly = Array.isArray(details.monthly_instruments) ? details.monthly_instruments : [];
    const first = initial[0] || monthly[0] || {};
    const monthlyFirst = monthly[0] || {};
    return {
        name: first?.name || monthlyFirst?.name || 'Банковский накопительный счёт',
        productType: String(first?.product_type || monthlyFirst?.product_type || '').toUpperCase(),
        share: toNum(first?.share ?? monthlyFirst?.share),
        yield: toNum(first?.short_term_yield ?? first?.yield ?? monthlyFirst?.short_term_yield ?? monthlyFirst?.yield),
        initialAmount: toNum(first?.amount),
        monthlyAmount: toNum(monthlyFirst?.amount),
    };
}

function finamInstrumentTypeLabel(productTypeRaw) {
    const type = String(productTypeRaw || '').toUpperCase();
    if (!type) return 'Инструмент';
    if (type === 'DEPOSIT') return 'Вклад';
    if (type === 'BOND') return 'Облигации';
    if (type === 'STOCK') return 'Акции';
    if (type === 'ETF') return 'ETF';
    return type;
}

const PASSIVE_PIE_COLORS = ['#d8b4fe', '#2563eb', '#7c3aed', '#10b981', '#f59e0b'];

function buildPassivePieSegments(instruments, totalFallback = 0) {
    const rows = Array.isArray(instruments) ? instruments : [];
    if (!rows.length) return [];
    const prepared = rows.map((item) => {
        const share = Math.max(0, toNum(item?.share));
        const amount = Math.max(0, toNum(item?.amount));
        const yieldPct = toNum(item?.short_term_yield ?? item?.yield);
        return {
            name: String(item?.name || 'Инструмент').trim() || 'Инструмент',
            share,
            amount,
            yieldPct,
        };
    });
    const sumAmounts = prepared.reduce((sum, item) => sum + item.amount, 0);
    const sumShares = prepared.reduce((sum, item) => sum + item.share, 0);
    const total = sumAmounts > 0 ? sumAmounts : Math.max(0, toNum(totalFallback));

    return prepared
        .map((item, idx) => {
            let pct = 0;
            if (sumAmounts > 0) pct = (item.amount / sumAmounts) * 100;
            else if (sumShares > 0) pct = (item.share / sumShares) * 100;
            else if (prepared.length > 0) pct = 100 / prepared.length;
            const amountFromPct = total > 0 ? (total * pct) / 100 : 0;
            return {
                name: item.name,
                pct,
                amount: item.amount > 0 ? item.amount : amountFromPct,
                yieldPct: item.yieldPct,
                color: PASSIVE_PIE_COLORS[idx % PASSIVE_PIE_COLORS.length],
            };
        })
        .filter((item) => item.pct > 0.001);
}

function buildPassivePieSvg(segments, filterId) {
    if (!Array.isArray(segments) || segments.length === 0) {
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="50" cy="50" r="38" fill="#e5e7eb" />
          </svg>`;
    }
    if (segments.length === 1) {
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="50" cy="50" r="38" fill="${segments[0].color}" />
          </svg>`;
    }
    const cx = 50;
    const cy = 50;
    const r = 38;
    let angle = -Math.PI / 2;
    const paths = [];
    const totalPct = segments.reduce((sum, seg) => sum + seg.pct, 0) || 1;
    segments.forEach((seg) => {
        const frac = seg.pct / totalPct;
        if (frac <= 0) return;
        const sweep = frac * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const largeArc = sweep > Math.PI ? 1 : 0;
        paths.push(
            `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${seg.color}"/>`
        );
    });
    const filter = filterId
        ? `<defs>
              <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-opacity="0.16"/>
              </filter>
            </defs>`
        : '';
    const groupOpen = filterId ? `<g filter="url(#${filterId})">` : '<g>';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        ${filter}
        ${groupOpen}
          ${paths.join('\n          ')}
        </g>
      </svg>`;
}

function buildPassiveLegendHtml(segments, isMonthly) {
    if (!segments.length) {
        return `<div class="pie-legend-row"><span class="pie-dot" style="background:#d1d5db" aria-hidden="true"></span><span><span class="pie-legend-name">Нет данных из расчёта</span></span></div>`;
    }
    return segments
        .map((seg) => {
            const pctText = `${(Math.round(seg.pct * 10) / 10).toLocaleString('ru-RU')}%`;
            const amountRounded = Math.round(Math.max(0, seg.amount)).toLocaleString('ru-RU');
            const amountText = isMonthly ? `${amountRounded} ₽/мес` : `${amountRounded} ₽`;
            const yieldText =
                seg.yieldPct > 0
                    ? ` · ${seg.yieldPct.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
                    : '';
            return `<div class="pie-legend-row">
            <span class="pie-dot" style="background:${seg.color}" aria-hidden="true"></span>
            <span><span class="pie-legend-name">${escapeHtml(seg.name)}</span> — <span class="pie-legend-meta">${pctText} · ${amountText}${yieldText}</span></span>
          </div>`;
        })
        .join('\n');
}

function applyPassiveIncomePortfolioStructure(html, goal, facts) {
    const goalType = String(goal?.goal_type || '').toUpperCase();
    const goalTypeId = Number(goal?.goal_type_id);
    const isPassiveGoal = goalType === 'PASSIVE_INCOME' || goalType === 'RENT' || goalTypeId === 2 || goalTypeId === 8;
    const isOtherLikeGoal = goalType === 'OTHER' || goalType === 'INVESTMENT' || goalTypeId === 4 || goalTypeId === 3;
    const isSupportedGoal = isPassiveGoal || isOtherLikeGoal;
    if (!isSupportedGoal || !html.includes('class="pie-row"')) return html;

    const details = goal?.details || {};
    const initialSegments = buildPassivePieSegments(details.initial_instruments, facts.initial);
    const monthlySegments = buildPassivePieSegments(details.monthly_instruments, facts.monthly);

    let out = html;
    out = replaceNthMatch(
        out,
        /<div class="pie-svg-wrap">[\s\S]*?<\/div>/g,
        `<div class="pie-svg-wrap">${buildPassivePieSvg(initialSegments, 'pie-sh-p1a')}</div>`,
        1
    );
    out = replaceNthMatch(
        out,
        /<div class="pie-svg-wrap">[\s\S]*?<\/div>/g,
        `<div class="pie-svg-wrap">${buildPassivePieSvg(monthlySegments, 'pie-sh-p1b')}</div>`,
        2
    );
    out = replaceNthMatch(
        out,
        /<div class="pie-legend">[\s\S]*?<\/div>/g,
        `<div class="pie-legend">\n${buildPassiveLegendHtml(initialSegments, false)}\n        </div>`,
        1
    );
    out = replaceNthMatch(
        out,
        /<div class="pie-legend">[\s\S]*?<\/div>/g,
        `<div class="pie-legend">\n${buildPassiveLegendHtml(monthlySegments, true)}\n        </div>`,
        2
    );
    if (!initialSegments.length && !monthlySegments.length) {
        console.warn(`[buildFinamReportHtml] ${goalType || 'GOAL'}: no portfolio instruments for pie blocks`);
    }
    return out;
}

function formatThousandShort(value) {
    const n = Math.max(0, toNum(value));
    return `${Math.round(n / 1000).toLocaleString('ru-RU')}к`;
}

function formatChartMonthShortRu(dateLike) {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return `${months[d.getMonth()]}'${String(d.getFullYear()).slice(-2)}`;
}

function formatChartMonthLongRu(dateLike) {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const months = [
        'январь',
        'февраль',
        'март',
        'апрель',
        'май',
        'июнь',
        'июль',
        'август',
        'сентябрь',
        'октябрь',
        'ноябрь',
        'декабрь',
    ];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function normalizeScheduleRowsForReserve(goal, facts) {
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const byMonth = new Map();
    rows.forEach((row) => {
        if (!row?.date) return;
        const d = new Date(row.date);
        if (Number.isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const total = toNum(row.total_capital);
        if (!Number.isFinite(total) || total < 0) return;
        byMonth.set(key, { date: d, total });
    });
    const points = [...byMonth.values()].sort((a, b) => a.date - b.date);
    if (points.length > 1) return points;

    const fallbackMonths = Math.max(1, facts.months || 12);
    const startIso = toMonthStartIso(new Date());
    const generated = [];
    for (let i = 0; i <= fallbackMonths; i += 1) {
        const iso = addMonths(startIso, i);
        const d = new Date(`${iso}T00:00:00`);
        const t = fallbackMonths > 0 ? i / fallbackMonths : 1;
        generated.push({
            date: d,
            total: facts.initial + (facts.totalCapital - facts.initial) * t,
        });
    }
    return generated;
}

function buildFinReserveChartSvg(goal, facts) {
    const points = normalizeScheduleRowsForReserve(goal, facts);
    if (!points.length) return null;

    const xStart = 36;
    const xEnd = 486;
    const yTop = 20;
    const yBottom = 110;
    const width = xEnd - xStart;
    const height = yBottom - yTop;

    const vals = points.map((p) => p.total);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const spread = Math.max(maxV - minV, Math.max(maxV, 1) * 0.08);
    const low = Math.max(0, minV - spread * 0.2);
    const high = maxV + spread * 0.2;
    const range = Math.max(1, high - low);

    const toY = (v) => yBottom - ((v - low) / range) * height;
    const toX = (i) => (points.length === 1 ? xStart : xStart + (i / (points.length - 1)) * width);

    const chartPoints = points.map((p, i) => ({ x: toX(i), y: toY(p.total), v: p.total, d: p.date }));
    const polyline = chartPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `M${polyline.replace(/\s+/g, ' L')} L${xEnd},${yBottom} L${xStart},${yBottom} Z`;

    const yTicks = 6;
    const gridLines = [];
    const yLabels = [];
    for (let i = 0; i < yTicks; i += 1) {
        const t = i / (yTicks - 1);
        const y = yBottom - t * height;
        const val = low + t * range;
        gridLines.push(`<line x1="${xStart}" y1="${y.toFixed(1)}" x2="${xEnd}" y2="${y.toFixed(1)}" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>`);
        yLabels.push(
            `<text x="32" y="${(y + 3).toFixed(1)}" font-size="6" fill="#999999" text-anchor="end" font-family="sans-serif">${formatThousandShort(
                val
            )}</text>`
        );
    }

    const xTicksCount = Math.min(6, chartPoints.length);
    const xTickSet = new Set();
    const xLabels = [];
    for (let i = 0; i < xTicksCount; i += 1) {
        const idx = Math.round((i * (chartPoints.length - 1)) / Math.max(1, xTicksCount - 1));
        if (xTickSet.has(idx)) continue;
        xTickSet.add(idx);
        const p = chartPoints[idx];
        xLabels.push(
            `<text x="${p.x.toFixed(1)}" y="130" font-size="5.5" fill="#999999" text-anchor="middle" font-family="sans-serif">${escapeHtml(
                formatChartMonthShortRu(p.d)
            )}</text>`
        );
    }

    const first = chartPoints[0];
    const mid = chartPoints[Math.floor((chartPoints.length - 1) / 2)];
    const last = chartPoints[chartPoints.length - 1];

    return `<svg class="chart-svg" viewBox="0 0 500 150" xmlns="http://www.w3.org/2000/svg">
        ${gridLines.join('\n        ')}
        ${yLabels.join('\n        ')}
        ${xLabels.join('\n        ')}
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#ag)"/>
        <polyline points="${polyline}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${chartPoints.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.3" fill="#6366f1"/>`).join('\n        ')}
        <text x="${first.x.toFixed(1)}" y="${Math.max(10, first.y - 6).toFixed(1)}" font-size="5.5" fill="#333" text-anchor="middle" font-family="sans-serif" font-weight="600">${formatThousandShort(
            first.v
        )}</text>
        <text x="${mid.x.toFixed(1)}" y="${Math.max(10, mid.y - 6).toFixed(1)}" font-size="5.5" fill="#333" text-anchor="middle" font-family="sans-serif" font-weight="600">${formatThousandShort(
            mid.v
        )}</text>
        <text x="${last.x.toFixed(1)}" y="${Math.max(10, last.y - 6).toFixed(1)}" font-size="5.5" fill="#333" text-anchor="middle" font-family="sans-serif" font-weight="600">${formatThousandShort(
            last.v
        )}</text>
        <rect x="404" y="6" width="120" height="15" rx="3" fill="#eef2ff" stroke="#c7d2fe" stroke-width="0.5"/>
        <text x="464" y="16" font-size="7" fill="#6366f1" text-anchor="middle" font-family="sans-serif" font-weight="700">${Math.round(
            last.v
        ).toLocaleString('ru-RU')} ₽</text>
      </svg>`;
}

function formatLifeRiskLimitHtml(amount) {
    const n = Math.max(0, toNum(amount));
    if (n >= 1_000_000) {
        const mln = n / 1_000_000;
        const value = Number.isInteger(mln) ? String(mln) : mln.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
        return `${value} <small>млн ₽</small>`;
    }
    return `${Math.round(n).toLocaleString('ru-RU')} <small>₽</small>`;
}

function replaceNthMatch(text, regex, replacement, n) {
    let idx = 0;
    return text.replace(regex, (...args) => {
        idx += 1;
        if (idx === n) return typeof replacement === 'function' ? replacement(...args) : replacement;
        return args[0];
    });
}

function replaceFirstN(text, regex, replacements) {
    let out = text;
    replacements.forEach((rep, i) => {
        out = replaceNthMatch(out, regex, rep, i + 1);
    });
    return out;
}

function removeElementById(html, id) {
    const marker = `id="${id}"`;
    const idIdx = html.indexOf(marker);
    if (idIdx < 0) return html;
    const openIdx = html.lastIndexOf('<div', idIdx);
    if (openIdx < 0) return html;
    let i = openIdx;
    let depth = 0;
    while (i < html.length) {
        const nextOpen = html.indexOf('<div', i);
        const nextClose = html.indexOf('</div>', i);
        if (nextClose < 0) return html;
        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth += 1;
            i = nextOpen + 4;
            continue;
        }
        depth -= 1;
        i = nextClose + 6;
        if (depth <= 0) {
            return html.slice(0, openIdx) + html.slice(i);
        }
    }
    return html;
}

function applyPensionHeroPlaceholders(html, goal) {
    if (!html.includes('{{PENSION_INCOME_PRESENT}}') && !html.includes('{{PENSION_INCOME_FUTURE}}')) return html;
    const s = goal?.summary || {};
    const present = toNum(s.target_amount_initial ?? s.projected_pension_monthly_present);
    const future = toNum(s.target_amount_future ?? s.projected_pension_monthly_future);
    return html
        .replace(/\{\{PENSION_INCOME_PRESENT\}\}/g, formatMoneyValue(present))
        .replace(/\{\{PENSION_INCOME_FUTURE\}\}/g, formatMoneyValue(future));
}

function applyPensionGapMetrics(html, goal) {
    if (!html.includes('Необходимый пассивный доход') || !html.includes('Пассивный доход с учётом инфляции')) return html;
    const s = goal?.summary || {};
    const targetPresent = toNum(s.target_amount_initial ?? s.projected_pension_monthly_present);
    const statePensionToday = toNum(s.state_pension_monthly_today);
    const requiredPassiveIncomeToday = Math.max(targetPresent - statePensionToday, 0);
    const pensionGapFuture = toNum(s.pension_gap_future);
    return html
        .replace(
            /(<div class="metric-value">)[\s\S]*?(<span> ₽\/мес<\/span><\/div>\s*<div class="metric-desc">Необходимый пассивный доход)/,
            `$1${formatIntValue(requiredPassiveIncomeToday)}<span> ₽/мес</span></div>\n        <div class="metric-desc">Необходимый пассивный доход`
        )
        .replace(
            /(<div class="metric-value">)[\s\S]*?(<span> ₽\/мес<\/span><\/div>\s*<div class="metric-desc">Пассивный доход с учётом инфляции)/,
            `$1${formatIntValue(pensionGapFuture)}<span> ₽/мес</span></div>\n        <div class="metric-desc">Пассивный доход с учётом инфляции`
        );
}

function stripPensionChartSection(html, goal) {
    const goalType = String(goal?.goal_type || '').toUpperCase();
    const goalTypeId = Number(goal?.goal_type_id);
    const isPensionGoal = goalType === 'PENSION' || goalTypeId === 1;
    if (!isPensionGoal) return html;
    let out = html;
    out = out.replace(
        /<div class="section-label">График капитала<\/div>[\s\S]*?(?=<div class="page-tail">)/,
        ''
    );
    return out;
}

function isOtherGoalTypeFour(goal) {
    const goalType = String(goal?.goal_type || '').toUpperCase();
    const goalTypeId = Number(goal?.goal_type_id);
    return goalTypeId === 4 || (!goalTypeId && goalType === 'OTHER');
}

function isSaveGrowGoal(goal) {
    const goalType = String(goal?.goal_type || '').toUpperCase();
    const goalTypeId = Number(goal?.goal_type_id);
    const name = String(goal?.goal_name || '').toLowerCase();
    return goalType === 'INVESTMENT' || goalTypeId === 3 || /сохран|приумнож/.test(name);
}

function stripOtherChartSection(html, goal) {
    if (!isOtherGoalTypeFour(goal) && !isSaveGrowGoal(goal)) return html;
    let out = html;
    out = out.replace(/<p class="passive-extras-note">[\s\S]*?<\/p>/, '');
    out = out.replace(
        /<div class="section-label">График капитала<\/div>[\s\S]*?(?=<div class="spacer"|<div class="page-num"|<footer class="footer">)/,
        ''
    );
    return out;
}

function applyOtherLayoutCompactFix(html, goal) {
    if (!isOtherGoalTypeFour(goal) && !isSaveGrowGoal(goal)) return html;
    if (html.includes('finam-other-compact-layout')) return html;
    const compactCss = `
    /* finam-other-compact-layout */
    .pie-row { gap: 8px; align-items: flex-start; }
    .pie-card { padding: 7px 7px 8px; }
    .pie-card-title { font-size: 10px; margin-bottom: 4px; }
    .pie-svg-wrap { width: 84px; height: 84px; margin-bottom: 4px; }
    .pie-legend-row { font-size: 10px; line-height: 1.28; gap: 3px; }
    .pie-legend-row > span { min-width: 0; overflow-wrap: anywhere; }
    .pie-dot { margin-top: 2px; }
    .other-risk-profile {
      margin: 0 0 6px;
      font-size: 10px;
      color: #475569;
      line-height: 1.3;
    }
    .other-risk-profile strong { color: #1f2937; font-weight: 700; }
    `;
    return html.replace('</style>', `${compactCss}\n  </style>`);
}

function applyOtherGoalTemplateAdjustments(html, goal, facts) {
    if (!isOtherGoalTypeFour(goal) && !isSaveGrowGoal(goal)) return html;
    let out = html;
    const isOtherGoal = isOtherGoalTypeFour(goal);

    const targetToday = isSaveGrowGoal(goal)
        ? toNum(goal?.summary?.initial_capital ?? facts.initial)
        : facts.targetToday > 0
          ? facts.targetToday
          : facts.totalCapital;
    const targetFuture = facts.targetFuture > 0 ? facts.targetFuture : facts.totalCapital;
    const horizonYears = facts.months > 0 ? facts.months / 12 : 0;
    const horizonText = horizonYears > 0 ? `${Number(horizonYears.toFixed(1)).toLocaleString('ru-RU')} лет` : 'срок цели';
    const inflationText = formatPercentValue(facts.inflationRate);

    const rightMetricTitle = isSaveGrowGoal(goal)
        ? `Ожидаемый капитал через ${horizonText}`
        : `Стоимость цели через ${horizonText}`;
    out = out.replace(
        /<div class="section-label">(Сумма и срок|Цель и горизонт|Капитал и горизонт)<\/div>[\s\S]*?(?=<div class="capital-highlight)/,
        `<div class="section-label">${isSaveGrowGoal(goal) ? 'Капитал и горизонт' : 'Сумма и срок'}</div>
    <div class="metrics-2">
      <div class="metric">
        <div class="metric-value">${formatCompactMoneyWithSpan(targetToday)}</div>
        <div class="metric-desc">${isSaveGrowGoal(goal) ? 'Начальный капитал' : 'Стоимость цели сегодня'}</div>
      </div>
      <div class="metric">
        <div class="metric-value">${formatCompactMoneyWithSpan(targetFuture)}</div>
        <div class="metric-desc">${rightMetricTitle}<br>${isSaveGrowGoal(goal) ? '' : `с учетом инфляции ${inflationText}`}</div>
      </div>
    </div>
    `
    );

    const portfolioYieldText = formatPercentValue(facts.portfolioYield);
    out = out.replace(
        /(<div class="plan-step-label">Доходность<br>портфеля<\/div>\s*<div class="plan-step-value">)[^<]*(<\/div>)/,
        `$1${portfolioYieldText}$2`
    );
    out = out.replace(
        /(<div class="plan-step-label">Начальный<br>капитал<\/div>\s*<div class="plan-step-value">)[^<]*(<\/div>)/,
        `$1${formatMoneyValue(toNum(goal?.summary?.initial_capital ?? facts.initial))}$2`
    );
    out = out.replace(
        /(<div class="plan-step-label">Пополнение<br>в месяц<\/div>\s*<div class="plan-step-value">)[^<]*(<\/div>)/,
        `$1${toNum(goal?.summary?.monthly_replenishment ?? facts.monthly).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽$2`
    );
    out = out.replace(
        /(<div class="plan-step-label">Срок<\/div>\s*<div class="plan-step-value">)[^<]*(<\/div>\s*<div class="plan-step-value plan-step-value--meta">)[^<]*(<\/div>)/,
        `$1${Math.max(0, Math.round(facts.months / 12))} лет$2${facts.months} мес.$3`
    );
    out = out.replace(
        /(<div class="plan-step-label">Капитал<br>к концу срока<\/div>\s*<div class="plan-step-value">)[^<]*(<\/div>)/,
        `$1${formatMoneyValue(facts.totalCapital)}$2`
    );
    out = out.replace(/<em>\d+(?:[.,]\d+)?% годовых<\/em>/, `<em>${portfolioYieldText} годовых</em>`);
    out = out.replace(/(<span class="pie-legend-meta">[^<]*?)\s*·\s*\d+(?:[.,]\d+)?%\s*(<\/span>)/g, '$1$2');
    if (!out.includes('other-risk-profile')) {
        out = out.replace(
            /(<div class="section-label">Структура портфеля<\/div>\s*)/,
            `$1<div class="other-risk-profile"><strong>Риск-профиль цели:</strong> ${escapeHtml(facts.riskProfileLabel)}</div>\n    `
        );
    }

    if (isOtherGoal) {
        const projectedEndCapital = toNum(goal?.summary?.projected_capital_at_end);
        const otherFinalCapital = projectedEndCapital > 0 ? projectedEndCapital : facts.totalCapital;
        out = out.replace(
            /(<div class="plan-step finish">[\s\S]*?<div class="plan-step-label">)[\s\S]*?(<\/div>\s*<div class="plan-step-value">)[^<]*(<\/div>)/,
            `$1Прогнозируемый<br>капитал$2${formatMoneyValue(otherFinalCapital)}$3`
        );
        // Для OTHER-целей убираем верхний акцентный блок "Капитал к дате сделки/к концу срока"
        // на первой странице: после блока "Сумма и срок" сразу идет следующая секция.
        out = out.replace(/\s*<div class="capital-highlight[\s\S]*?<\/div>\s*(?=<div class="section-label">План)/, '\n\n    ');
        // В карточках вычетов/софинансирования скрываем поясняющий мелкий текст.
        out = out.replace(/<div class="tax-card-hint">[\s\S]*?<\/div>/g, '');
    }

    out = stripOtherChartSection(out, goal);
    out = applyOtherLayoutCompactFix(out, goal);
    if (isSaveGrowGoal(goal)) {
        out = out.replace(/<div class="capital-exact">[\s\S]*?<\/div>/, '');
        out = out.replace(
            /<div id="savegrow-benefits-dynamic"[\s\S]*?<\/div>\s*<\/div>/,
            ''
        );
        out = out.replace(/<p class="passive-extras-note">[\s\S]*?<\/p>/, '');
        out = out.replace(
            /<\/style>/,
            `
    .pie-card { padding: 6px 6px 8px; }
    .pie-card-title { font-size: 10px; margin-bottom: 4px; }
    .pie-svg-wrap { width: 82px; height: 82px; margin-bottom: 4px; }
    .pie-legend-row { font-size: 10px; line-height: 1.25; gap: 3px; }
    .fin-bar-val { font-size: 9px; line-height: 1.15; }
  </style>`
        );
    }
    return out;
}

function applyGoalFactsToTemplate(html, goal) {
    const facts = computeGoalFacts(goal);
    let out = html;
    const goalType = String(goal?.goal_type || '').toUpperCase();
    const goalTypeId = Number(goal?.goal_type_id);

    out = applyPensionHeroPlaceholders(out, goal);
    out = applyPensionGapMetrics(out, goal);
    out = stripPensionChartSection(out, goal);
    out = applyOtherGoalTemplateAdjustments(out, goal, facts);
    out = applyPassiveIncomePortfolioStructure(out, goal, facts);

    out = out.replace(/(Налоговый вычет за )\d{4}( год)/g, `$1${facts.yearTax}$2`);
    out = out.replace(/(Софинансирование за )\d{4}( год)/g, `$1${facts.yearCofin}$2`);

    out = replaceFirstN(
        out,
        /<div class="tax-card-value">[^<]*<\/div>/g,
        [
            `<div class="tax-card-value">${formatMoneyValue(facts.taxYearAmount)}</div>`,
            `<div class="tax-card-value">${formatMoneyValue(facts.totalTax)}</div>`,
            `<div class="tax-card-value">${formatMoneyValue(facts.cofinYearAmount)}</div>`,
            `<div class="tax-card-value">${formatMoneyValue(facts.totalCofin)}</div>`,
        ]
    );

    out = replaceFirstN(
        out,
        /<span class="fin-bar-val">[^<]*<\/span>/g,
        [
            `<span class="fin-bar-val">${formatRubValue(facts.own)}</span>`,
            `<span class="fin-bar-val">${formatRubValue(facts.extra)}</span>`,
            `<span class="fin-bar-val">${formatRubValue(facts.totalCapital)}</span>`,
            `<span class="fin-bar-val">${formatRubValue(facts.cofinYearAmount)}</span>`,
            `<span class="fin-bar-val">${formatRubValue(facts.totalCofin)}</span>`,
        ]
    );

    out = out.replace(/<div class="capital-exact">[^<]*<\/div>/, `<div class="capital-exact">${formatMoneyValue(facts.totalCapital)}</div>`);
    out = out.replace(
        /<div class="capital-big">[^<]*<span>[^<]*<\/span><\/div>/,
        `<div class="capital-big">${(facts.totalCapital / 1_000_000).toLocaleString('ru-RU', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        })}<span> млн ₽</span></div>`
    );

    const hasTaxBenefits = facts.taxYearAmount > 0 || facts.totalTax > 0;
    const hasCofinBenefits = facts.cofinYearAmount > 0 || facts.totalCofin > 0;
    if (!hasCofinBenefits) {
        if (hasTaxBenefits) {
            out = out.replace(/<div class="section-label">Софинансирование и вычеты<\/div>/g, '<div class="section-label">Налоговые вычеты</div>');
        }
        out = out.replace(
            /<div class="section-label passive-benefits-subtitle">Софинансирование<\/div>\s*<div class="tax-row">[\s\S]*?<\/div>\s*/g,
            ''
        );
        out = out.replace(
            /<div class="tax-card[^"]*">\s*<div class="tax-card-label">Софинансирование за \d{4} год<\/div>[\s\S]*?<\/div>\s*/g,
            ''
        );
        out = out.replace(
            /<div class="tax-card[^"]*">\s*<div class="tax-card-label">Всего софинансирование за период плана<\/div>[\s\S]*?<\/div>\s*/g,
            ''
        );
    }

    out = out.replace(
        /<div class="tax-card-hint">Сумма по строкам графика с датами в выбранном году \(поле tax_deduction\)\.<\/div>/g,
        ''
    );
    out = out.replace(
        /<div class="tax-card-hint">Итог по модели \(total_tax_benefit\), с учётом лимитов и сценария взносов\.<\/div>/g,
        ''
    );

    const isFinReserve = goalType === 'FIN_RESERVE' || goalTypeId === 7;
    if (isFinReserve) {
        const inst = resolvePrimaryGoalInstrument(goal);
        const months = facts.months > 0 ? facts.months : 0;
        const reserveYield = inst.yield > 0 ? inst.yield : facts.portfolioYield;
        const reserveInitial = inst.initialAmount > 0 ? inst.initialAmount : facts.initial;
        const reserveMonthly = inst.monthlyAmount > 0 ? inst.monthlyAmount : facts.monthly;
        const reserveFinal = facts.totalCapital;
        const reserveShare = inst.share > 0 ? `${Math.round(inst.share)}%` : '100%';

        out = out.replace(
            /<div class="goal-subtitle">[\s\S]*?<\/div>/,
            `<div class="goal-subtitle">Подушка безопасности, срок формирования — ${months} месяцев</div>`
        );
        out = out.replace(
            /<div class="goal-comment">[\s\S]*?<\/div>/,
            `<div class="goal-comment">Начальный капитал <em>${formatMoneyValue(reserveInitial)}</em> уже на месте. Пополнение ${formatMoneyValue(reserveMonthly)}/мес на вкладе с доходностью ${formatPercentValue(
                reserveYield
            )} доведёт капитал до <em>${formatMoneyValue(reserveFinal)}</em> за ${months} месяцев.</div>`
        );

        out = out.replace(
            /<div class="metric-value green">[\s\S]*?<\/div>/,
            `<div class="metric-value green">${Math.round(reserveInitial).toLocaleString('ru-RU')}<span> ₽</span></div>`
        );
        out = out.replace(
            /<div class="metric-value">[\s\S]*?<span> ₽\/мес<\/span><\/div>/,
            `<div class="metric-value">${Math.round(reserveMonthly).toLocaleString('ru-RU')}<span> ₽/мес</span></div>`
        );
        out = out.replace(
            /<div class="metric-value amber">[\s\S]*?<\/div>/,
            `<div class="metric-value amber">${Math.round(reserveFinal).toLocaleString('ru-RU')}<span> ₽</span></div>`
        );
        out = out.replace(/(<div class="metric-desc">Итог через )\d+( мес<\/div>)/, `$1${months}$2`);

        out = out.replace(
            /<div class="instrument-name">[\s\S]*?<\/div>/,
            `<div class="instrument-name">${escapeHtml(inst.name)}</div>`
        );
        out = out.replace(
            /(<span class="instrument-key">Тип<\/span>\s*<span class="instrument-val">)[\s\S]*?(<\/span>)/,
            `$1${escapeHtml(finamInstrumentTypeLabel(inst.productType))}$2`
        );
        out = out.replace(
            /(<span class="instrument-key">Доля<\/span>\s*<span class="instrument-val">)[\s\S]*?(<\/span>)/,
            `$1${escapeHtml(reserveShare)}$2`
        );
        out = out.replace(
            /(<span class="instrument-key">Начальная сумма<\/span>\s*<span class="instrument-val">)[\s\S]*?(<\/span>)/,
            `$1${escapeHtml(formatMoneyValue(reserveInitial))}$2`
        );
        out = out.replace(
            /(<span class="instrument-key">Ежемесячное пополнение<\/span>\s*<span class="instrument-val">)[\s\S]*?(<\/span>)/,
            `$1${escapeHtml(formatMoneyValue(reserveMonthly))}$2`
        );
        out = out.replace(
            /<div class="instrument-yield-big">[\s\S]*?<\/div>/,
            `<div class="instrument-yield-big">${formatPercentValue(reserveYield)}</div>`
        );

        const schedulePoints = normalizeScheduleRowsForReserve(goal, facts);
        const firstDate = schedulePoints[0]?.date;
        const lastDate = schedulePoints[schedulePoints.length - 1]?.date;
        const rangeTitle =
            firstDate && lastDate
                ? `Рост капитала: ${formatChartMonthLongRu(firstDate)} → ${formatChartMonthLongRu(lastDate)}`
                : `Рост капитала за ${months} месяцев`;
        out = out.replace(/<div class="chart-title">[\s\S]*?<\/div>/, `<div class="chart-title">${escapeHtml(rangeTitle)}</div>`);
        const chartSvg = buildFinReserveChartSvg(goal, facts);
        if (chartSvg) {
            out = out.replace(/<svg class="chart-svg"[\s\S]*?<\/svg>/, chartSvg);
        }
    }

    const isLife = goalType === 'LIFE' || goalTypeId === 5;
    if (isLife) {
        const details = goal?.details || {};
        const summary = goal?.summary || {};
        const risks = Array.isArray(details.risks) ? details.risks.filter((r) => toNum(r?.limit_amount) > 0) : [];
        const maxRisk = Math.max(1, ...risks.map((r) => toNum(r.limit_amount)));
        const annualPremium = toNum(details.annual_premium ?? summary.annual_premium ?? facts.initial);
        const monthlyPremium = annualPremium > 0 ? annualPremium / 12 : facts.monthly;
        const yearTaxLife = toNum(summary.tax_deduction_2026 ?? details.tax_deduction_2026 ?? facts.taxYearAmount);
        const totalTaxLife = toNum(summary.total_tax_deductions ?? details.total_tax_deductions ?? facts.totalTax);
        const inst = resolvePrimaryGoalInstrument(goal);
        const lifeYield = inst.yield > 0 ? inst.yield : facts.portfolioYield;
        const lifeShare = inst.share > 0 ? `${Math.round(inst.share)}%` : '100%';
        const programName = details.program_name || inst.name || 'НСЖ';
        const productTypeLabel = finamInstrumentTypeLabel(inst.productType || 'NSZH');

        if (risks.length > 0) {
            for (let i = 0; i < 3; i += 1) {
                const risk = risks[i];
                if (!risk) break;
                const idx = i + 1;
                out = replaceNthMatch(
                    out,
                    /<div class="life-risk-name">[\s\S]*?<\/div>/g,
                    `<div class="life-risk-name">${escapeHtml(String(risk.risk_name || 'Риск'))}</div>`,
                    idx
                );
                out = replaceNthMatch(
                    out,
                    /<div class="life-risk-limit">[\s\S]*?<\/div>/g,
                    `<div class="life-risk-limit">${formatLifeRiskLimitHtml(risk.limit_amount)}</div>`,
                    idx
                );
                out = replaceNthMatch(
                    out,
                    /<div class="life-risk-bar" style="width:\s*[^"]+;"><\/div>/g,
                    `<div class="life-risk-bar" style="width: ${Math.max(8, Math.round((toNum(risk.limit_amount) / maxRisk) * 100))}%;"></div>`,
                    idx
                );
            }
        }

        out = out.replace(
            /(<div class="life-premium-label">Взнос в год<\/div>\s*<div class="life-premium-val">)[\s\S]*?(<span> ₽<\/span><\/div>)/,
            `$1${annualPremium.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}$2`
        );
        out = out.replace(
            /(<div class="life-premium-label">Взнос в месяц<\/div>\s*<div class="life-premium-val">)[\s\S]*?(<span> ₽<\/span><\/div>)/,
            `$1${monthlyPremium.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}$2`
        );

        out = out.replace(
            /(<div class="life-hero-program">Продукт: <span>)[\s\S]*?(<\/span><\/div>)/,
            `$1${escapeHtml(programName)}$2`
        );
        out = out.replace(
            /<div class="life-product-name">[\s\S]*?<\/div>/,
            `<div class="life-product-name">${escapeHtml(programName)}</div>`
        );
        out = out.replace(
            /(<div class="life-product-row"><span>Тип продукта<\/span><span>)[\s\S]*?(<\/span><\/div>)/,
            `$1${escapeHtml(productTypeLabel)}$2`
        );
        out = out.replace(
            /(<div class="life-product-row"><span>Доля в цели<\/span><span>)[\s\S]*?(<\/span><\/div>)/,
            `$1${escapeHtml(lifeShare)}$2`
        );
        out = out.replace(
            /(<div class="life-product-row"><span>Начальная сумма<\/span><span>)[\s\S]*?(<\/span><\/div>)/,
            `$1${escapeHtml(formatMoneyValue(annualPremium))}$2`
        );
        out = out.replace(
            /(<div class="life-product-row"><span>Ежемесячное пополнение<\/span><span>)[\s\S]*?(<\/span><\/div>)/,
            `$1${escapeHtml(formatMoneyValue(monthlyPremium))}$2`
        );
        out = out.replace(
            /<div class="life-yield-big">[\s\S]*?<\/div>/,
            `<div class="life-yield-big">${formatPercentValue(lifeYield)}</div>`
        );

        out = out.replace(
            /(<div class="life-tax-desc">)[\s\S]*?(<\/div>)/,
            `$1По модели плана: суммарный вычет <em>${formatMoneyValue(totalTaxLife)}</em>; в том числе оценка на <em>2026 год — ${formatMoneyValue(
                yearTaxLife
            )}</em> (не налоговая консультация).$2`
        );
        out = out.replace(
            /<div class="life-tax-big">[\s\S]*?<\/div>/,
            `<div class="life-tax-big">${formatMoneyValue(totalTaxLife)}</div>`
        );
        out = out.replace(
            /<div class="life-tax-small" style="margin-top:4px;font-weight:600;color:#059669;">[\s\S]*?<\/div>/,
            `<div class="life-tax-small" style="margin-top:4px;font-weight:600;color:#059669;">+${formatMoneyValue(yearTaxLife)} в 2026</div>`
        );
    }

    const isPension = goalType === 'PENSION' || goalTypeId === 1;
    if (isPension) {
        const details = goal?.details || {};
        const summary = goal?.summary || {};
        const retirementYear = resolvePensionRetirementYear(goal);
        const stateToday = toNum(summary.state_pension_monthly_today);
        const stateFuture = toNum(summary.state_pension_monthly_future);
        const desiredToday = toNum(summary.projected_pension_monthly_present ?? summary.target_amount_initial);
        const gapToday = Math.max(desiredToday - stateToday, 0);
        const gapFuture = toNum(summary.pension_gap_future);
        const inflationRate = toNum(summary.inflation_rate);

        const initialSum = sumInstrumentAmounts(details.initial_instruments);
        const monthlySum = sumInstrumentAmounts(details.monthly_instruments);
        const initialPension = initialSum > 0 ? initialSum : facts.initial;
        const monthlyPension = monthlySum > 0 ? monthlySum : facts.monthly;
        const months = facts.months > 0 ? facts.months : Math.round(toNum(summary.target_months));
        const years = months > 0 ? Math.floor(months / 12) : 0;
        const totalCapital = toNum(summary.projected_capital_at_retirement ?? facts.totalCapital);
        const portfolioYield = toNum(summary.accumulation_yield_percent ?? facts.portfolioYield);
        const payoutYield = toNum(summary.payout_yield_percent);

        out = out.replace(
            /(<span class="kv-key">Год выхода на пенсию<\/span>\s*<span class="kv-val">)[^<]*(<\/span>)/,
            `$1${retirementYear || '—'}$2`
        );
        out = out.replace(
            /(<span class="kv-key">Прогноз в «сегодняшних» рублях \(в месяц\)<\/span>\s*<span class="kv-val">)[^<]*(<\/span>)/,
            `$1${formatMoneyValue(stateToday)}$2`
        );
        out = out.replace(
            /(<span class="kv-key">Прогноз с учётом инфляции к году выхода \(в месяц\)<\/span>\s*<span class="kv-val">)[^<]*(<\/span>)/,
            `$1${formatMoneyValue(stateFuture)}$2`
        );
        out = out.replace(
            /(<span class="kv-key">Инфляция в модели<\/span>\s*<span class="kv-val">)[^<]*(<\/span>)/,
            `$1${formatPercentValue(inflationRate)} годовых$2`
        );

        out = out.replace(
            /<div class="speech-sm">[\s\S]*?<\/div>/,
            `<div class="speech-sm"><p>Госпенсии не хватает до желаемого уровня: нехватка дохода к выходу на пенсию — <em>${formatMoneyValue(
                gapToday
            )}/мес</em> в сегодняшних рублях, а с учётом инфляции это составит <em>${formatMoneyValue(
                gapFuture
            )}/мес</em> в деньгах того времени. Эту часть закрываем отдельной целью «пассивный доход» через накопленный капитал.</p></div>`
        );

        out = replaceFirstN(
            out,
            /<div class="plan-step-value">[^<]*<\/div>/g,
            [
                `<div class="plan-step-value">${formatMoneyValue(initialPension)}</div>`,
                `<div class="plan-step-value">${monthlyPension.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</div>`,
                `<div class="plan-step-value">${years} лет</div>`,
                `<div class="plan-step-value">${formatPercentValue(portfolioYield)}</div>`,
                `<div class="plan-step-value">${formatMoneyValue(totalCapital)}</div>`,
            ]
        );
        out = out.replace(
            /<div class="plan-step-value plan-step-value--meta">\d+\s*мес\.<\/div>/,
            `<div class="plan-step-value plan-step-value--meta">${months} мес.</div>`
        );

        out = out.replace(
            /(<span class="instrument-key">Начальная сумма<\/span>\s*<span class="instrument-val">)[^<]*(<\/span>)/,
            `$1${formatMoneyValue(initialPension)}$2`
        );
        out = out.replace(
            /(<span class="instrument-key">Ежемесячное пополнение<\/span>\s*<span class="instrument-val">)[^<]*(<\/span>)/,
            `$1${monthlyPension.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽$2`
        );
        out = out.replace(/<div class="instrument-yield-big">[^<]*<\/div>/, `<div class="instrument-yield-big">${formatPercentValue(portfolioYield)}</div>`);

        out = out.replace(/<div class="capital-exact">[^<]*<\/div>/, `<div class="capital-exact">${formatMoneyValue(totalCapital)}</div>`);
        out = out.replace(
            /<div class="capital-big">[^<]*<span>[^<]*<\/span><\/div>/,
            `<div class="capital-big">${(Math.max(0, totalCapital) / 1_000_000).toLocaleString('ru-RU', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            })}<span> млн ₽</span></div>`
        );
        out = out.replace(
            /<em>\d+% в год<\/em>/,
            `<em>${formatPercentValue(payoutYield || 12)} в год</em>`
        );
        out = out.replace(
            /<em>\d+% годовых<\/em>/,
            `<em>${formatPercentValue(portfolioYield)} годовых</em>`
        );

        out = applyFinBarsScaleByValues(out, [facts.own, facts.extra, totalCapital]);
    }

    const isEducation = (goalType === 'OTHER' || goalType === 'INVESTMENT' || goalTypeId === 4 || goalTypeId === 3) &&
        /образован/i.test(String(goal?.goal_name || ''));
    if (isEducation) {
        const childName = resolveEducationChildName(goal);
        if (childName) {
            out = out.replace(/<div class="education-hero-title">[\s\S]*?<\/div>/, `<div class="education-hero-title">Образование. ${escapeHtml(childName)}</div>`);
            out = out.replace(
                /<div class="doc-label">Образование(?:\s*—\s*продолжение)?<\/div>/,
                `<div class="doc-label">Образование · ${escapeHtml(childName)}</div>`
            );
        }
    }

    const shouldShowBenefits = hasTaxBenefits || hasCofinBenefits;
    if (!shouldShowBenefits) {
        const ids = [
            'savegrow-benefits-dynamic',
            'capital-goal-benefits-dynamic',
            'education-benefits-dynamic',
            'apartment-benefits-dynamic',
            'house-benefits-dynamic',
            'business-goal-benefits-dynamic',
            'travel-goal-benefits-dynamic',
            'car-goal-benefits-dynamic',
            'passive-benefits-dynamic',
        ];
        ids.forEach((id) => {
            out = removeElementById(out, id);
        });
    }
    out = applyFinBarHeightsFromCurrentValues(out);
    return out;
}

function upsertRow(byMonth, isoDate) {
    if (!isoDate) return null;
    if (!byMonth.has(isoDate)) {
        byMonth.set(isoDate, {
            date: isoDate,
            replenishment: 0,
            tax_deduction: 0,
            cofinancing: 0,
            total_capital: 0,
            schedule_row_kind: '',
        });
    }
    return byMonth.get(isoDate);
}

function getGoalInitialFromSchedule(goal) {
    const rows = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
    const initial = rows.find((row) => String(row?.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP');
    if (initial) return toNum(initial.replenishment);
    return toNum(goal?.summary?.initial_capital);
}

function buildRepleneshmentRows(report = {}) {
    const goals = Array.isArray(report?.goals_detailed) ? report.goals_detailed : [];
    const byMonth = new Map();
    const currentMonth = toMonthStartIso(new Date());

    const initialRow = upsertRow(byMonth, currentMonth);
    if (initialRow) initialRow.schedule_row_kind = 'INITIAL_LUMP';

    for (const goal of goals) {
        const goalType = String(goal?.goal_type || '').toUpperCase();
        if (goalType === 'RENT' || goalType === 'LIFE') continue;

        const schedule = Array.isArray(goal?.details?.monthly_schedule) ? goal.details.monthly_schedule : [];
        for (const srcRow of schedule) {
            const isoDate = toMonthStartIso(srcRow?.date);
            if (!isoDate) continue;
            const isInitialLump = String(srcRow?.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP';
            const row = upsertRow(byMonth, isoDate);
            // INITIAL_LUMP в строке графика уже отражён в getGoalInitialFromSchedule — иначе двойной учёт в первой строке
            if (!isInitialLump) {
                row.replenishment += toNum(srcRow?.replenishment);
            }
            row.tax_deduction += toNum(srcRow?.tax_deduction);
            row.cofinancing += toNum(srcRow?.cofinancing);
            row.total_capital += toNum(srcRow?.total_capital);
        }

        if (initialRow) initialRow.replenishment += getGoalInitialFromSchedule(goal);
    }

    for (const goal of goals) {
        const goalType = String(goal?.goal_type || '').toUpperCase();
        if (goalType !== 'LIFE') continue;

        const annualPremium = toNum(goal?.details?.annual_premium ?? goal?.summary?.initial_capital);
        const monthlyPremium = annualPremium / 12;
        const lifeTaxDeduction = toNum(goal?.summary?.tax_deduction_2026 ?? goal?.details?.tax_deduction_2026);
        const termMonths = Math.max(0, Math.round(toNum(goal?.summary?.term_months ?? goal?.summary?.target_months)));
        const lifeFinalCapital = toNum(
            goal?.summary?.projected_capital_at_end ??
                goal?.summary?.expected_cash_value ??
                goal?.summary?.target_amount_future
        );
        const lifeStart = currentMonth;

        if (initialRow) initialRow.replenishment += annualPremium;

        for (let i = 1; i <= termMonths; i += 1) {
            const isoDate = addMonths(lifeStart, i);
            if (!isoDate) continue;
            const row = upsertRow(byMonth, isoDate);
            row.replenishment += monthlyPremium;

            const monthNumber = Number(isoDate.slice(5, 7));
            if (monthNumber === 4 && lifeTaxDeduction > 0) {
                row.tax_deduction += lifeTaxDeduction;
            }

            if (i === termMonths) {
                row.total_capital += lifeFinalCapital;
            }
        }
    }

    return [...byMonth.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Строк таблицы на лист A4; с запасом (перенос в ячейках иначе обрезает хвост чанка в iframe 842px). */
const FINAM_REPLENISHMENT_ROWS_PER_PAGE = 22;

function buildRepleneshmentTableTbodyHtml(rows) {
    if (!rows.length) {
        return `<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:14px">Нет строк расписания в данных отчёта</td></tr>`;
    }
    return rows
        .map(
            (row) => `
          <tr>
            <td class="rep-col-date">${escapeHtml(row.date)}</td>
            <td class="rep-col-num">${escapeHtml(formatMoney(row.replenishment))}</td>
            <td class="rep-col-num">${escapeHtml(formatMoney(row.tax_deduction))}</td>
            <td class="rep-col-num">${escapeHtml(formatMoney(row.cofinancing))}</td>
            <td class="rep-col-num">${escapeHtml(formatMoney(row.total_capital))}</td>
          </tr>`
        )
        .join('\n');
}

/**
 * Один HTML-документ с одним или несколькими листами `article.page`; для PDF — через splitFinamPage4IntoStandalonePages.
 */
function buildRepleneshmentPageHtml(report = {}) {
    const rows = buildRepleneshmentRows(report);
    const chunks = [];
    for (let i = 0; i < rows.length; i += FINAM_REPLENISHMENT_ROWS_PER_PAGE) {
        chunks.push(rows.slice(i, i + FINAM_REPLENISHMENT_ROWS_PER_PAGE));
    }
    if (chunks.length === 0) chunks.push([]);

    const tableHead = `
    <thead>
      <tr>
        <th>Дата</th>
        <th>Пополнение</th>
        <th>Налоговый вычет</th>
        <th>Софинансирование</th>
        <th>Итоговый капитал</th>
      </tr>
    </thead>`;

    const articles = chunks
        .map((chunk, idx) => {
            const paging =
                chunks.length > 1
                    ? `<p class="rep-paging">Страница ${idx + 1} из ${chunks.length} · сводный график пополнений</p>`
                    : '';
            return `<article class="page">
  <div class="rep-content">
    <header class="rep-header">
      <div class="logo-mark"><div class="logo-dot"></div><span class="logo-text">Финансовый план</span></div>
      <div class="doc-label">Сводный график</div>
    </header>
    <div class="rep-divider"></div>
    <h1>Сводный график пополнений</h1>
    ${paging}
    <table class="rep-table">
      ${tableHead}
      <tbody>
${buildRepleneshmentTableTbodyHtml(chunk)}
      </tbody>
    </table>
    <div class="rep-spacer"></div>
    <footer class="rep-footer">
      <div class="rep-footer-left">Персональный финансовый план · Конфиденциально<br>Все партнёры осуществляют деятельность на основании лицензий ЦБ РФ</div>
      <div class="rep-footer-right">Информация не является индивидуальной<br>инвестиционной рекомендацией</div>
    </footer>
  </div>
</article>`;
        })
        .join('\n\n');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
      background: #ffffff;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    article.page {
      width: 595px;
      height: 842px;
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
      padding: 30px 36px 26px;
      font-size: 12px;
      line-height: 1.45;
      color: #212121;
      background-color: #fafbfc;
    }
    article.page::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(100, 120, 170, 0.14) 1px, transparent 1px),
        linear-gradient(90deg, rgba(100, 120, 170, 0.14) 1px, transparent 1px);
      background-size: 20px 20px;
      pointer-events: none;
      z-index: 0;
    }
    .rep-content { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .rep-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-shrink: 0; }
    .logo-mark { display: flex; align-items: center; gap: 6px; }
    .logo-dot { width: 8px; height: 8px; border-radius: 2px; background: #6366f1; }
    .logo-text { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #000; }
    .doc-label { font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: #000; padding: 3px 10px; border: 1px solid #000; border-radius: 4px; }
    .rep-divider { height: 1px; background: #000; margin-bottom: 12px; flex-shrink: 0; }
    .rep-spacer { flex: 1; }
    .rep-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; padding-top: 5px; border-top: 1px solid #ccc; flex-shrink: 0; }
    .rep-footer-left { font-size: 10px; color: #555; line-height: 1.4; }
    .rep-footer-right { font-size: 10px; color: #555; text-align: right; line-height: 1.4; }
    h1 { font-size: 18px; line-height: 1.2; margin-bottom: 8px; font-weight: 700; flex-shrink: 0; color: #000; }
    .rep-paging {
      font-size: 11px;
      color: #4b5563;
      margin-bottom: 10px;
      flex-shrink: 0;
    }
    table.rep-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      background: rgba(255,255,255,0.95);
      flex-shrink: 0;
    }
    .rep-table th,
    .rep-table td {
      border: 1px solid #d1d5db;
      padding: 3px 5px;
      text-align: left;
      font-size: 9px;
      line-height: 1.2;
      vertical-align: top;
      word-break: normal;
    }
    .rep-table th { background: #f3f4f6; font-weight: 700; font-size: 9px; }
    .rep-table td.rep-col-date { white-space: nowrap; width: 14%; }
    .rep-table td.rep-col-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .rep-table thead th:nth-child(1) { width: 14%; }
    .rep-table tbody tr:nth-child(even) { background: rgba(249,250,251,0.85); }
    @media print {
      body { margin: 0; padding: 0; }
      article.page { page-break-after: always; }
      article.page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
${articles}
</body>
</html>`;
}

async function fetchAiB2cAvatarUrl(projectId) {
    if (projectId == null || projectId === '') return null;
    try {
        const row = await db('ai_b2c_settings').where({ project_id: Number(projectId) }).first();
        const url = row?.avatar_url;
        return typeof url === 'string' && url.trim() ? url.trim() : null;
    } catch (err) {
        console.warn('[buildFinamReportHtml] ai_b2c_settings.avatar_url:', err?.message || err);
        return null;
    }
}

const FINAM_FAMILY_CONTEXT_FILE = path.join(TEMPLATE_DIR, 'context-page-03-family.md');
const FINAM_GOALS_CONTEXT_FILE = path.join(TEMPLATE_DIR, 'context-goals-by-type.md');

const PAGE3_SPEECH1_FALLBACK =
    '<p>Вот ваша финансовая фотография на сегодня. Доход <em>150 000 ₽</em>, но обязательства съедают почти всё — свободным остаётся всего <em>8 000 ₽</em> в месяц. Именно отсюда мы начнём строить план.</p>';

const PAGE3_SPEECH2_FALLBACK =
    '<p>Выделяю три ключевых момента. Во-первых, <em>ипотека съедает 27% дохода</em> — это в рамках нормы, но рефинансирование может освободить ещё 5–8 тысяч. Во-вторых, <em>категория «Прочее» — 32 000 ₽ без расшифровки</em>: здесь почти наверняка скрыты импульсивные траты. В-третьих, <em>подушка безопасности — всего 200 000 ₽</em>, при обязательствах 142 000 ₽ в месяц этого хватит меньше чем на полтора месяца. На следующей странице покажу, как это исправить.</p>';

function readFinamFamilyContextMarkdown() {
    try {
        if (!fs.existsSync(FINAM_FAMILY_CONTEXT_FILE)) return '';
        return fs.readFileSync(FINAM_FAMILY_CONTEXT_FILE, 'utf-8');
    } catch (e) {
        console.warn('[buildFinamReportHtml] context-page-03-family.md:', e?.message || e);
        return '';
    }
}

function readFinamGoalsContextMarkdown() {
    try {
        if (!fs.existsSync(FINAM_GOALS_CONTEXT_FILE)) return '';
        return fs.readFileSync(FINAM_GOALS_CONTEXT_FILE, 'utf-8');
    } catch (e) {
        console.warn('[buildFinamReportHtml] context-goals-by-type.md:', e?.message || e);
        return '';
    }
}

function goalTypeContextKey(goal) {
    const gt = String(goal?.goal_type || '').toUpperCase();
    const id = Number(goal?.goal_type_id);
    if (gt === 'FIN_RESERVE' || id === 7) return 'GOAL_FIN_RESERVE_AI_MAIN';
    if (gt === 'LIFE' || id === 5) return 'GOAL_LIFE_AI_MAIN';
    if (gt === 'PENSION' || id === 1) return 'GOAL_PENSION_AI_MAIN';
    return 'GOAL_OTHER_AI_MAIN';
}

function buildGoalAiPayload(goal) {
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    return {
        goal_type: goal?.goal_type,
        goal_name: goal?.goal_name,
        target_months: summary?.target_months ?? details?.term_months,
        target_amount_initial: summary?.target_amount_initial,
        target_amount_future: summary?.target_amount_future,
        projected_capital_at_end: summary?.projected_capital_at_end,
        projected_capital_at_retirement: summary?.projected_capital_at_retirement,
        projected_pension_monthly_present: summary?.projected_pension_monthly_present,
        pension_gap_future: summary?.pension_gap_future,
        state_pension_monthly_today: summary?.state_pension_monthly_today,
        state_pension_monthly_future: summary?.state_pension_monthly_future,
        inflation_rate: summary?.inflation_rate,
        initial_capital: summary?.initial_capital,
        monthly_replenishment: summary?.monthly_replenishment,
        annual_premium: details?.annual_premium,
        tax_deduction_2026: summary?.tax_deduction_2026 ?? details?.tax_deduction_2026,
        total_tax_deductions: summary?.total_tax_deductions ?? details?.total_tax_deductions,
        total_tax_benefit: summary?.total_tax_benefit,
        total_cofinancing: summary?.total_cofinancing,
        accumulation_yield_percent: summary?.accumulation_yield_percent,
        payout_yield_percent: summary?.payout_yield_percent,
        initial_instruments: Array.isArray(details?.initial_instruments) ? details.initial_instruments.slice(0, 3) : [],
        monthly_instruments: Array.isArray(details?.monthly_instruments) ? details.monthly_instruments.slice(0, 3) : [],
        risks: Array.isArray(details?.risks) ? details.risks.slice(0, 3) : [],
    };
}

/** Значение ключа `KEY=` из markdown до следующего `\nKEY2=` или конца файла. */
function parseFinamMarkdownContextKey(mdRaw, keyBase) {
    if (!mdRaw || typeof mdRaw !== 'string' || !keyBase) return '';
    const key = `${keyBase}=`;
    const idx = mdRaw.indexOf(key);
    if (idx < 0) return '';
    let rest = mdRaw.slice(idx + key.length);
    const nextKeyMatch = rest.match(/\n[A-Za-z0-9_]+\s*=/);
    if (nextKeyMatch && nextKeyMatch.index != null) {
        rest = rest.slice(0, nextKeyMatch.index);
    }
    return rest.trim().replace(/\r\n/g, '\n');
}

function buildFinamFamilyPageAiPayload(report) {
    const rich = report?.family_page_ai_context;
    if (rich && typeof rich === 'object' && Object.keys(rich).length > 0) {
        return rich;
    }
    const ci = report?.client_info || {};
    const cs = report?.current_situation || {};
    return {
        _note: 'family_page_ai_context отсутствует — только базовые поля отчёта.',
        client: {
            first_name: ci.first_name,
            age: ci.age,
            income_rub_per_month: ci.avg_monthly_income,
            income_display: ci.income_display,
        },
        wealth: {
            net_worth: cs.net_worth,
            assets_total: cs.assets_total,
            liabilities_total: cs.liabilities_total,
            assets_breakdown: Array.isArray(cs.assets_breakdown) ? cs.assets_breakdown.slice(0, 20) : [],
        },
        goals: (report?.goals_detailed || []).map((g) => ({
            goal_type: g.goal_type,
            name: g.goal_title_raw || g.goal_name,
            monthly_replenishment: g.summary?.monthly_replenishment,
        })),
        plan_waterfall: report?.overall_plan?.chart_waterfall || null,
    };
}

function finamAiPlainTextToLeadParagraphHtml(text) {
    const inner = escapeHtml(text.trim())
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('<br />\n        ');
    return `<p>${inner}</p>`;
}

async function fetchOpenRouterModelForFinamReport(projectId) {
    const fromEnv =
        process.env.OPENROUTER_MODEL_FINAM_PAGE3 ||
        process.env.OPENROUTER_MODEL_FINAM_INTRO ||
        process.env.OPENROUTER_MODEL_SUMMARY ||
        process.env.OPENROUTER_MODEL ||
        null;
    if (projectId == null || projectId === '') return fromEnv;
    try {
        const row = await db('ai_b2c_settings').where({ project_id: Number(projectId) }).first();
        const dbModel = row?.openrouter_model != null ? String(row.openrouter_model).trim() : '';
        return dbModel || fromEnv;
    } catch (err) {
        console.warn('[buildFinamReportHtml] ai_b2c_settings.openrouter_model:', err?.message || err);
        return fromEnv;
    }
}

const FINAM_MARITAL_LABEL = {
    single: 'Не в браке',
    married: 'В браке',
    divorced: 'В разводе',
    widowed: 'Вдовец / вдова',
    civil_union: 'Гражданский брак',
};

const FINAM_EMPLOYMENT_LABEL = {
    EMPLOYED: 'Наёмный сотрудник',
    SELF_EMPLOYED: 'Самозанятый',
    UNEMPLOYED: 'Безработный',
    RETIRED: 'Пенсионер',
    OTHER: 'Другое',
    employed: 'Наёмный сотрудник',
    self_employed: 'Самозанятый',
    unemployed: 'Безработный',
    retired: 'Пенсионер',
    other: 'Другое',
};

const FINAM_OBLIGATION_TYPE_LABEL = {
    mortgage: 'Ипотека',
    loans: 'Кредиты',
    rent: 'Аренда',
    alimony: 'Алименты',
    education: 'Образование',
    elder_support: 'Родители',
    other: 'Прочее',
};

function labelFinamMaritalStatus(value) {
    if (value == null || value === '') return '—';
    const k = String(value).toLowerCase().trim();
    return FINAM_MARITAL_LABEL[k] || escapeHtml(String(value));
}

function labelFinamEmploymentType(value) {
    if (value == null || value === '') return '—';
    const raw = String(value).trim();
    const u = raw.toUpperCase().replace(/-/g, '_');
    const mapped = FINAM_EMPLOYMENT_LABEL[raw] || FINAM_EMPLOYMENT_LABEL[u] || FINAM_EMPLOYMENT_LABEL[raw.toLowerCase()];
    return mapped || escapeHtml(raw);
}

/** Склонение «N лет» для целого возраста (рус.). */
function ruYearsPhrase(age) {
    if (age == null || age === '') return '—';
    const a = Math.floor(Number(age));
    if (!Number.isFinite(a) || a < 0) return '—';
    const m100 = a % 100;
    const m10 = a % 10;
    if (m100 >= 11 && m100 <= 14) return `${a} лет`;
    if (m10 === 1) return `${a} год`;
    if (m10 >= 2 && m10 <= 4) return `${a} года`;
    return `${a} лет`;
}

function labelFinamObligationType(type) {
    const k = String(type || 'other').toLowerCase();
    return FINAM_OBLIGATION_TYPE_LABEL[k] || escapeHtml(String(type || 'Прочее'));
}

/**
 * Страница 3: карточки «Семья / Активы», обязательства и баланс — из report.family_page_ai_context (тот же JSON, что для ИИ).
 */
function applyFinamPage3FamilyFactsFromReport(html, report) {
    if (!html || typeof html !== 'string') return html;
    const ctx = buildFinamFamilyPageAiPayload(report);
    if (!ctx || typeof ctx !== 'object') return html;

    const marital = labelFinamMaritalStatus(ctx.client?.marital_status);
    const employment = labelFinamEmploymentType(ctx.client?.employment_type);
    const clientAge = escapeHtml(ruYearsPhrase(ctx.client?.age));

    const children = Array.isArray(ctx.family?.children) ? ctx.family.children : [];
    let childrenBlockHtml = '';
    if (children.length > 0) {
        const rows = children
            .map((ch) => {
                const nm = escapeHtml(ch.first_name || 'Ребёнок');
                const ag = escapeHtml(ruYearsPhrase(ch.age_years));
                return `        <div class="child-row">
            <div class="child-dot"></div>
            <span class="child-name">${nm}</span>
            <span class="child-age">${ag}</span>
          </div>`;
            })
            .join('\n');
        childrenBlockHtml = `        <div class="children-block">
          <div class="children-block-title">Дети</div>
${rows}
        </div>`;
    }

    const assetsBreakdown = Array.isArray(ctx.wealth?.assets_breakdown) ? ctx.wealth.assets_breakdown : [];
    const positiveAssets = assetsBreakdown.filter((a) => toNum(a?.value) > 0);
    let assetRowsHtml;
    if (positiveAssets.length > 0) {
        assetRowsHtml = positiveAssets
            .map(
                (a) => `        <div class="info-row">
          <span class="info-label">${escapeHtml(a.name || 'Актив')}</span>
          <span class="info-value">${formatMoneyValue(toNum(a.value))}</span>
        </div>`
            )
            .join('\n');
    } else {
        assetRowsHtml = `        <div class="info-row">
          <span class="info-label">Итого по счетам</span>
          <span class="info-value">${formatMoneyValue(toNum(ctx.wealth?.assets_total))}</span>
        </div>`;
    }

    const assetsTotal = toNum(ctx.wealth?.assets_total);
    const liabilitiesTotal = toNum(ctx.wealth?.liabilities_total);

    const familyCardHtml = `      <div class="info-card">
        <div class="info-card-title">Семья</div>
        <div class="info-row">
          <span class="info-label">Семейное положение</span>
          <span class="info-value">${marital}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Занятость</span>
          <span class="info-value">${employment}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Возраст</span>
          <span class="info-value">${clientAge}</span>
        </div>
${childrenBlockHtml ? `${childrenBlockHtml}\n` : ''}      </div>`;

    const assetsCardHtml = `      <div class="info-card">
        <div class="info-card-title">Активы</div>
${assetRowsHtml}
        <div class="info-divider"></div>
        <div class="info-row">
          <span class="info-label">Итого активы</span>
          <span class="info-value">${formatMoneyValue(assetsTotal)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Долги</span>
          <span class="info-value">${formatMoneyValue(liabilitiesTotal)}</span>
        </div>
      </div>`;

    const twoColsHtml = `    <div class="two-cols">
${familyCardHtml}
${assetsCardHtml}
    </div>`;

    const obligationsRaw = Array.isArray(ctx.family?.family_obligations) ? ctx.family.family_obligations : [];
    const obligations = obligationsRaw.filter((o) => toNum(o?.amount_monthly) > 0);
    const amounts = obligations.map((o) => toNum(o.amount_monthly));
    const maxOb = amounts.length ? Math.max(...amounts) : 1;
    const obTotal = toNum(ctx.cashflow_monthly_rub?.obligations_total);
    const obTotalFormatted = `${Math.round(obTotal).toLocaleString('ru-RU')} ₽/мес`;

    let obligationsRowsHtml;
    if (obligations.length === 0) {
        obligationsRowsHtml = `      <div class="obligation-row">
        <span class="obligation-label">—</span>
        <div class="obligation-bar-bg"><div class="obligation-bar" style="width: 0%;"></div></div>
        <span class="obligation-value">${formatMoneyValue(0)}</span>
      </div>`;
    } else {
        obligationsRowsHtml = obligations
            .map((o) => {
                const amt = toNum(o.amount_monthly);
                const pct = Math.min(100, Math.round((amt / maxOb) * 1000) / 10);
                return `      <div class="obligation-row">
        <span class="obligation-label">${labelFinamObligationType(o.type)}</span>
        <div class="obligation-bar-bg"><div class="obligation-bar" style="width: ${pct}%;"></div></div>
        <span class="obligation-value">${formatMoneyValue(amt)}</span>
      </div>`;
            })
            .join('\n');
    }

    const obligationsBlockHtml = `    <div class="obligations">
      <div class="obligations-header">
        <div class="section-tag" style="margin-bottom: 0;">Ежемесячные обязательства</div>
        <div class="obligations-total">Итого: ${obTotalFormatted}</div>
      </div>
${obligationsRowsHtml}
    </div>`;

    const incomeDisplay = toNum(ctx.cashflow_monthly_rub?.income);
    const incomeBase = Math.max(incomeDisplay, 1);
    const pfp = toNum(ctx.cashflow_monthly_rub?.planned_pfp_contributions);
    const freeRaw = toNum(ctx.cashflow_monthly_rub?.discretionary_or_free);
    const obForBalance = toNum(ctx.cashflow_monthly_rub?.obligations_total);

    const wOb = Math.min(100, Math.round((obForBalance / incomeBase) * 1000) / 10);
    const wPfp = Math.min(100, Math.round((pfp / incomeBase) * 1000) / 10);
    const wFree = Math.min(100, Math.max(0, Math.round((freeRaw / incomeBase) * 1000) / 10));

    const freeStyle = freeRaw < 0 ? ' style="color: #dc2626;"' : ' style="color: #6366f1;"';

    const balanceBoxHtml = `    <div class="balance-box">
      <div class="balance-title">Баланс доходов и расходов</div>
      <div class="balance-row">
        <span class="balance-label">Доходы</span>
        <div class="balance-bar-bg"><div class="balance-bar green" style="width: 100%;"></div></div>
        <span class="balance-val">${formatMoneyValue(incomeDisplay)}</span>
      </div>
      <div class="balance-row">
        <span class="balance-label">Обязательства</span>
        <div class="balance-bar-bg"><div class="balance-bar red" style="width: ${wOb}%;"></div></div>
        <span class="balance-val">${formatMoneyValue(obForBalance)}</span>
      </div>
      <div class="balance-row">
        <span class="balance-label">Пополнение ПФП</span>
        <div class="balance-bar-bg"><div class="balance-bar amber" style="width: ${wPfp}%;"></div></div>
        <span class="balance-val">${formatMoneyValue(pfp)}</span>
      </div>
      <div class="balance-separator"></div>
      <div class="balance-row">
        <span class="balance-label" style="font-weight: 700; color: #000000;">Свободно</span>
        <div class="balance-bar-bg"><div class="balance-bar indigo" style="width: ${wFree}%;"></div></div>
        <span class="balance-val"${freeStyle}>${formatMoneyValue(freeRaw)}</span>
      </div>
    </div>`;

    let out = html;
    const reSection = /<div class="section-tag">Семья и активы<\/div>\s*<div class="two-cols">[\s\S]*<\/div>\s*\n\s*<!-- Обязательства -->/;
    if (reSection.test(out)) {
        out = out.replace(
            reSection,
            `<div class="section-tag">Семья и активы</div>\n${twoColsHtml}\n    <!-- Обязательства -->`
        );
    }

    const reObl = /<div class="obligations">[\s\S]*<\/div>\s*\n\s*<!-- Баланс/;
    if (reObl.test(out)) {
        out = out.replace(reObl, `${obligationsBlockHtml}\n\n    <!-- Баланс`);
    }

    const reBal = /<div class="balance-box">[\s\S]*<\/div>\s*\n\s*<!-- ИИ: вывод -->/;
    if (reBal.test(out)) {
        out = out.replace(reBal, `${balanceBoxHtml}\n\n    <!-- ИИ: вывод -->`);
    }

    return out;
}

/**
 * Страница 3 «Текущее состояние»: два блока .speech через OpenRouter + context-page-03-family.md (AI_page_1=, AI_page_1_2=).
 * В запрос всегда включается JSON из report.family_page_ai_context (или запасной срез из отчёта).
 */
async function applyFinamPage3FamilyAi(html, report, projectId) {
    if (!html || typeof html !== 'string' || !html.includes('data-finam-ai-page3')) {
        return html;
    }

    const md = readFinamFamilyContextMarkdown();
    const ctx1 = parseFinamMarkdownContextKey(md, 'AI_page_1');
    const ctx2 = parseFinamMarkdownContextKey(md, 'AI_page_1_2');
    const payload = buildFinamFamilyPageAiPayload(report);
    const payloadJson = JSON.stringify(payload, null, 2);

    const systemCore = [
        'Ты помогаешь заполнять PDF-отчёт «Финансовый план» (Финам), страница «Текущее состояние».',
        'Ответь только связным текстом (без заголовков, без Markdown # ** _). Можно кавычки «». Обращение на «вы».',
        'Опирайся строго на поле JSON с данными клиента; не придумывай суммы и факты, которых нет в JSON.',
        'Только русский язык.',
    ].join('\n');

    async function runSpeech(contextExtra, userTask, fallbackPhtml) {
        if (!contextExtra) return fallbackPhtml;
        try {
            if (!aiService.apiKey) {
                console.warn('[buildFinamReportHtml] Page3 family AI skipped: no API key');
                return fallbackPhtml;
            }
            const model =
                (await fetchOpenRouterModelForFinamReport(projectId)) ||
                process.env.OPENROUTER_MODEL ||
                'google/gemma-3-27b-it';
            const systemPrompt = [systemCore, contextExtra].filter(Boolean).join('\n\n');
            const userPrompt = `${userTask}\n\nДанные клиента и плана (JSON — обязательно используй в ответе):\n${payloadJson}`;
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ];
            const raw = await aiService.getCompletion(messages, model);
            if (!raw || !String(raw).trim()) return fallbackPhtml;
            return finamAiPlainTextToLeadParagraphHtml(raw);
        } catch (err) {
            console.warn('[buildFinamReportHtml] Page3 family AI failed:', err?.message || err);
            return fallbackPhtml;
        }
    }

    const speech1Inner = await runSpeech(
        ctx1,
        'Напиши текст для первого блока речи ИИ (вводная «финансовая фотография» на сегодня).',
        PAGE3_SPEECH1_FALLBACK
    );
    const speech2Inner = await runSpeech(
        ctx2,
        'Напиши текст для второго блока речи ИИ (краткие выводы по структуре обязательств и плану пополнений целей).',
        PAGE3_SPEECH2_FALLBACK
    );

    let out = html;
    const re1 = /<div class="speech"[^>]*data-finam-ai-page3="1"[^>]*>\s*<p>[\s\S]*?<\/p>\s*<\/div>/i;
    const re2 = /<div class="speech"[^>]*data-finam-ai-page3="2"[^>]*>\s*<p>[\s\S]*?<\/p>\s*<\/div>/i;
    if (re1.test(out)) {
        out = out.replace(re1, `<div class="speech" data-finam-ai-page3="1">\n        ${speech1Inner}\n      </div>`);
    }
    if (re2.test(out)) {
        out = out.replace(re2, `<div class="speech" data-finam-ai-page3="2">\n        ${speech2Inner}\n      </div>`);
    }
    return out;
}

async function applyFinamGoalAiSpeech(html, goal, projectId) {
    if (!html || typeof html !== 'string') return html;
    if (!html.includes('<div class="speech">')) return html;
    const md = readFinamGoalsContextMarkdown();
    const commonRules = parseFinamMarkdownContextKey(md, 'GOAL_COMMON_RULES');
    const goalCtx = parseFinamMarkdownContextKey(md, goalTypeContextKey(goal));
    if (!goalCtx) return html;
    try {
        if (!aiService.apiKey) return html;
        const model =
            (await fetchOpenRouterModelForFinamReport(projectId)) ||
            process.env.OPENROUTER_MODEL ||
            'google/gemma-3-27b-it';
        const payload = buildGoalAiPayload(goal);
        const systemPrompt = [commonRules, goalCtx].filter(Boolean).join('\n\n');
        const userPrompt = `Сформируйте краткий текст ИИ для верхнего блока речи на странице цели.\n\nJSON-выжимка:\n${JSON.stringify(
            payload,
            null,
            2
        )}`;
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];
        const raw = await aiService.getCompletion(messages, model);
        const text = String(raw || '').trim();
        if (!text) return html;
        const p = `<p>${escapeHtml(text).replace(/\r?\n+/g, ' ')}</p>`;
        return html.replace(
            /(<div class="avatar-section">\s*<div class="avatar">[\s\S]*?<\/div>\s*<div class="speech">\s*)<p>[\s\S]*?<\/p>(\s*<\/div>)/,
            `$1${p}$2`
        );
    } catch (err) {
        console.warn('[buildFinamReportHtml] goal AI speech failed:', err?.message || err);
        return html;
    }
}

/**
 * Подставляет аватар B2C-ассистента (R2 / ai_b2c_settings) вместо плейсхолдеров «ИИ» в финам-шаблонах.
 */
function applyFinamAiAvatarHtml(html, avatarUrl) {
    if (!avatarUrl || typeof html !== 'string') return html;
    const safe = escapeHtml(avatarUrl);
    const imgTag = `<img src="${safe}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;"/>`;

    let out = html;
    if (!out.includes('data-finam-report-ai-avatar')) {
        const styleBlock = `<style data-finam-report-ai-avatar="1">
.goal-ai-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
.avatar > img, .avatar-sm > img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
.ai-avatar { position: relative; }
.ai-avatar > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 50%; z-index: 2; }
.ai-avatar:has(> img)::after { display: none !important; }
</style>`;
        out = out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${styleBlock}`);
    }

    out = out.replace(
        /<div class="avatar">\s*<span class="avatar-text">[\s\S]*?<\/span>\s*<\/div>/gi,
        `<div class="avatar">${imgTag}</div>`
    );

    out = out.replace(
        /<div class="avatar-sm[^"]*">\s*<span class="avatar-sm-text">[\s\S]*?<\/span>\s*<\/div>/gi,
        (m) => {
            const cls = m.match(/^<div class="([^"]*)"/i);
            const c = cls ? cls[1] : 'avatar-sm';
            return `<div class="${c}">${imgTag}</div>`;
        }
    );

    out = out.replace(/<div class="goal-ai-avatar">\s*<svg[\s\S]*?<\/svg>\s*<\/div>/gi, `<div class="goal-ai-avatar">${imgTag}</div>`);

    out = out.replace(/<div class="ai-avatar"([^>]*)>\s*<\/div>/gi, `<div class="ai-avatar"$1>${imgTag}</div>`);

    return out;
}

function filterGoalsByTypes(goals, goalTypesRaw) {
    const list = Array.isArray(goals) ? goals : [];
    if (!goalTypesRaw) return list;
    const valid = new Set(['FIN_RESERVE', 'LIFE', 'PENSION', 'INVESTMENT', 'OTHER', 'PASSIVE_INCOME', 'RENT']);
    const requested = new Set(
        String(goalTypesRaw)
            .split(',')
            .map((x) => x.trim().toUpperCase())
            .filter((x) => valid.has(x))
    );
    if (!requested.size) return list;
    return list.filter((goal) => requested.has(String(goal?.goal_type || '').toUpperCase()));
}

async function buildFinamFullPageHtmlList({
    report,
    includeSummary = true,
    goalTypes = null,
    finamAiAvatarUrl = null,
    projectId = null,
    inflationPageHtml = null,
}) {
    let avatarUrl = finamAiAvatarUrl;
    if (!avatarUrl && projectId != null) {
        avatarUrl = await fetchAiB2cAvatarUrl(projectId);
    }

    const withInline = (pageHtml) => inlineFinamRasterImages(pageHtml, FINAM_REPO_ROOT);

    const pages = [];
    if (includeSummary) {
        pages.push(withInline(await readTemplate('page-2-finam.html')));
        let page3 = await readTemplate('page-3-family-finam.html');
        page3 = applyFinamPage3FamilyFactsFromReport(page3, report);
        page3 = await applyFinamPage3FamilyAi(page3, report, projectId);
        pages.push(withInline(page3));
        let page4 = await readTemplate('page-4-targets-finam.html');
        const rawGoalsForPage4 = filterGoalsByTypes(report?.goals_detailed || [], goalTypes);
        const orderedForPage4 = orderFinamGoalsForPdf(rawGoalsForPage4);
        page4 = applyFinamPage4TargetsFromReport(page4, orderedForPage4);
        for (const page4Part of splitFinamPage4IntoStandalonePages(page4)) {
            pages.push(withInline(page4Part));
        }
    }

    const goals = orderFinamGoalsForPdf(filterGoalsByTypes(report?.goals_detailed || [], goalTypes));
    for (const goal of goals) {
        const template = resolveGoalTemplateFile(goal);
        if (!template) continue;
        const raw = await readTemplate(template);
        let goalHtml = applyGoalFactsToTemplate(raw, goal);
        goalHtml = await applyFinamGoalAiSpeech(goalHtml, goal, projectId);
        for (const goalPart of splitFinamPage4IntoStandalonePages(goalHtml)) {
            pages.push(withInline(goalPart));
        }
    }

    let portfolioFinal = await readTemplate('portfolio-final-page-finam.html');
    portfolioFinal = applyFinamPortfolioFinalPage(portfolioFinal, report);
    for (const portfolioPart of splitFinamPage4IntoStandalonePages(portfolioFinal)) {
        pages.push(withInline(portfolioPart));
    }

    let actionPlan = await readTemplate('action-plan-finam.html');
    actionPlan = applyFinamActionPlanPage(actionPlan, report);
    pages.push(withInline(actionPlan));

    let taxPlanning = await readTemplate('tax-planning-block-finam.html');
    taxPlanning = applyFinamTaxPlanningPage(taxPlanning, report);
    pages.push(withInline(taxPlanning));

    let comonAutofollow = await readTemplate('comon-autofollow-finam.html');
    comonAutofollow = applyFinamComonAutofollowPage(comonAutofollow, report);
    pages.push(withInline(comonAutofollow));

    if (inflationPageHtml && String(inflationPageHtml).trim()) {
        pages.push(withInline(String(inflationPageHtml)));
    }

    for (let ri = 1; ri <= 5; ri += 1) {
        pages.push(withInline(await readTemplate(`risk-declaration-preview-${ri}.html`)));
    }

    const replenMerged = buildRepleneshmentPageHtml(report);
    for (const replenPart of splitFinamPage4IntoStandalonePages(replenMerged)) {
        pages.push(withInline(replenPart));
    }

    if (!avatarUrl) return pages;
    return pages.map((pageHtml) => applyFinamAiAvatarHtml(pageHtml, avatarUrl));
}

module.exports = {
    FINAM_PROJECT_ID,
    FINAM_REPO_ROOT,
    resolveOtherGoalTemplateFile,
    resolveGoalTemplateFile,
    buildRepleneshmentPageHtml,
    buildFinamFullPageHtmlList,
    applyGoalFactsToTemplate,
    fetchAiB2cAvatarUrl,
    applyFinamAiAvatarHtml,
    inlineFinamRasterImages,
    applyFinamPage3FamilyAi,
    applyFinamPage3FamilyFactsFromReport,
    buildFinamFamilyPageAiPayload,
};
