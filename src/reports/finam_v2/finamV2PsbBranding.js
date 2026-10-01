/**
 * Цвета и витрина ПСБ поверх Finam v2. Включается только при reportBrand === "psb".
 */

const fs = require('fs');
const path = require('path');
const { PSB_SHOWCASE_CATALOG } = require('./finamV2PsbProductCatalog');
const { isPsbReport } = require('./finamV2PsbPageConfig');

const ASSETS = path.join(__dirname, 'assets', 'psb');

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

function fontFace(fileName, weight) {
    const filePath = path.join(ASSETS, fileName);
    if (!fs.existsSync(filePath)) return '';
    const data = fs.readFileSync(filePath).toString('base64');
    return `@font-face{font-family:Gilroy;font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${data}) format('truetype');}`;
}

function fundImageDataUrl(fileName) {
    if (!fileName) return '';
    const filePath = path.join(ASSETS, 'funds', fileName);
    if (!fs.existsSync(filePath)) return '';
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function productCardHtml(product) {
    const image = fundImageDataUrl(product.image);
    const thumb = image ? `<img class="finam-v2-psb__thumb" src="${image}" alt="" />` : '';
    const yieldChip = product.yieldLabel
        ? `<span class="finam-v2-tail__chip finam-v2-tail__chip--accent">${escapeHtml(product.yieldLabel)}</span>`
        : '';
    return `<article class="finam-v2-tail__product-card${thumb ? ' finam-v2-psb__card' : ''}">
        ${thumb}
        <div>
          <h2 class="finam-v2-tail__product-title">${escapeHtml(product.name)}</h2>
          <p class="finam-v2-tail__product-text">${escapeHtml(product.blurb)}</p>
          <div class="finam-v2-tail__chip-row">
            ${yieldChip}
            <a class="finam-v2-tail__chip finam-v2-idu__link" href="${escapeAttr(product.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.linkLabel || 'Подробнее')}</a>
          </div>
        </div>
      </article>`;
}

function factsHtml(facts) {
    if (!facts || !facts.length) return '';
    const cells = facts.map((fact) => `<div class="finam-v2-psb__fact">
        <div class="finam-v2-psb__fact-value">${escapeHtml(fact.value)}</div>
        <div class="finam-v2-psb__fact-label">${escapeHtml(fact.label)}</div>
      </div>`).join('');
    return `<section class="finam-v2-psb__facts">${cells}</section>`;
}

function sectionHtml(section) {
    const cards = (section.products || []).map(productCardHtml).join('\n');
    const columns = section.columns === 2 ? ' finam-v2-tail__card-grid--2' : '';
    return `<section>
      <p class="finam-v2-tail__section-title">${escapeHtml(section.title)}</p>
      <section class="finam-v2-tail__card-grid${columns}">${cards}</section>
    </section>`;
}

function tailHeader(pill) {
    return `<header class="finam-v2-wow__header">
      <div class="finam-v2-wow__header-left">
        <span class="finam-v2-wow__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-wow__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-wow__pill">${escapeHtml(pill)}</span>
    </header>
    <hr class="finam-v2-wow__rule" />`;
}

function tailFooter() {
    return `<hr class="finam-v2-wow__footer-rule" />
    <footer class="finam-v2-wow__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-wow__footer-right">Не является ИИР</span>
    </footer>`;
}

function buildShowcase(assetKey) {
    const catalog = PSB_SHOWCASE_CATALOG[assetKey];
    if (!catalog) return '';
    const sections = (catalog.sections || []).map(sectionHtml).join('\n');
    return `<article class="finam-v2-page finam-v2-psb-showcase-page">
    ${tailHeader(catalog.pill)}
    <section class="finam-v2-tail__hero finam-v2-tail__hero--full">
      <div>
        <p class="finam-v2-wow__eyebrow">${escapeHtml(catalog.eyebrow)}</p>
        <h1 class="finam-v2-wow__headline">${escapeHtml(catalog.headline)}</h1>
        <p class="finam-v2-wow__lead">${escapeHtml(catalog.lead)}</p>
      </div>
    </section>
    ${factsHtml(catalog.facts)}
    ${sections}
    <p class="finam-v2-tail__disclaimer finam-v2-tail__page-note">${escapeHtml(catalog.disclaimer)}</p>
    ${tailFooter()}
  </article>`;
}

function replaceArticles(html, replacement) {
    const re = /<article\b[^>]*class="[^"]*finam-v2-page[^"]*"[^>]*>[\s\S]*?<\/article>/i;
    return String(html || '').replace(re, replacement);
}

function replacePsbEquityPage(html) {
    return replaceArticles(html, buildShowcase('equity'));
}

function replacePsbBondsPage(html) {
    return replaceArticles(html, buildShowcase('bonds'));
}

function replacePsbMixedPage(html) {
    return replaceArticles(html, buildShowcase('mixed'));
}

function replacePsbBrokerPage(html) {
    return replaceArticles(html, buildShowcase('broker'));
}

function replacePsbNpfBrokerPage(html) {
    return replaceArticles(html, buildShowcase('npfBroker'));
}

function psbStyleTag() {
    return `<style id="psb-report-brand">
${fontFace('Gilroy-Regular.ttf', 400)}
${fontFace('Gilroy-SemiBold.ttf', 600)}
:root, .finam-v2-page {
  --finam-v2-color-navy: #284045;
  --finam-v2-color-navy-deep: #1E2D30;
  --finam-v2-color-text: #1E2D30;
  --finam-v2-color-text-muted: #5C6F72;
  --finam-v2-color-border: #E1BB8F;
  --finam-v2-color-surface: #F6F4EF;
  --finam-v2-color-accent-soft: #F6F4EF;
  --finam-v2-color-accent-blue: #7A9489;
  --finam-v2-color-check: #7A9489;
  --finam-v2-color-positive: #9FB596;
  --finam-v2-color-warning: #C89A5E;
  --finam-v2-color-danger: #DC7070;
  --finam-v2-font-stack: Gilroy, 'Segoe UI', sans-serif;
  --finam-v2-font-display: Gilroy, 'Segoe UI', sans-serif;
}
.finam-v2-page { color: #1E2D30; font-family: Gilroy, 'Segoe UI', sans-serif; }
.finam-v2-wow__pill, .finam-v2-wow__header-dot { background: #7A9489; color: #F6F4EF; }
.finam-v2-wow__headline, .finam-v2-cover__title { color: #284045; }
.finam-v2-psb-showcase-page .finam-v2-wow__headline { font-size: 22px; margin: 4px 0; }
.finam-v2-psb-showcase-page .finam-v2-tail__card-grid { gap: 6px; margin-bottom: 6px; }
.finam-v2-psb-showcase-page .finam-v2-tail__product-card { min-height: 0; padding: 8px 10px; }
.finam-v2-psb__card { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 0 8px; align-items: center; }
.finam-v2-psb__thumb { width: 48px; height: 48px; object-fit: contain; display: block; }
.finam-v2-psb-showcase-page .finam-v2-tail__product-title { font-size: 11px; margin: 0 0 2px; }
.finam-v2-psb-showcase-page .finam-v2-tail__product-text { font-size: 9px; line-height: 1.3; margin: 0; }
.finam-v2-psb__facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0 0 8px; }
.finam-v2-psb__fact { background: #fff; border: 1px solid rgba(30, 45, 48, .12); border-radius: 8px; padding: 6px 8px; }
.finam-v2-psb__fact-value { font-size: 13px; line-height: 1.15; color: #284045; font-weight: 600; }
.finam-v2-psb__fact-label { margin-top: 2px; font-size: 8px; line-height: 1.25; color: #5C6F72; }
</style>`;
}

function applyPsbReportBranding(html) {
    const src = String(html || '');
    if (src.includes('id="psb-report-brand"')) return src;
    if (src.includes('</head>')) return src.replace('</head>', `${psbStyleTag()}</head>`);
    return `${psbStyleTag()}${src}`;
}

function replaceMarked(html, attr, value, replacement) {
    const source = String(html || '');
    const markerRe = new RegExp(`${attr}\\s*=\\s*["']${value}["']`, 'i');
    const markerMatch = markerRe.exec(source);
    if (!markerMatch) return source;
    const openIdx = source.lastIndexOf('<', markerMatch.index);
    const tagMatch = source.slice(openIdx).match(/^<([a-zA-Z][\w:-]*)\b/);
    if (!tagMatch) return source;
    const tag = tagMatch[1];
    const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = openIdx;
    let depth = 0;
    let match;
    while ((match = tagRe.exec(source))) {
        const token = match[0];
        const closing = token.startsWith('</');
        const selfClosing = /\/\s*>$/.test(token);
        if (closing) depth -= 1;
        else if (!selfClosing) depth += 1;
        if (depth === 0) {
            return source.slice(0, openIdx) + replacement + source.slice(match.index + token.length);
        }
    }
    return source;
}

function rubHtml(value) {
    const amount = Math.round(Number(value) || 0);
    const text = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return `${text}\u00a0₽`;
}

function yearWord(years) {
    const n = Math.abs(Number(years) || 0);
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return 'год';
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'года';
    return 'лет';
}

function lifeShieldIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 4v5c0 5-3 9-7 11-4-2-7-6-7-11V7l7-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>`;
}

/**
 * Текст листа «Защита жизни» для «Добра наживешь». Общий шаблон Финама не меняется.
 */
function applyPsbLifeGoalCopy(html, context) {
    const goal = context?.goal || {};
    const summary = goal.summary || {};
    const details = goal.details || {};
    const months = Number(summary.target_months || goal.term_months || 240);
    let years = Number.isFinite(months) && months > 0 ? Math.round(months / 12) : 20;
    if (years < 5) years = 5;
    if (years > 25) years = 25;
    const coverage = Number(summary.target_coverage || summary.target_amount_initial || goal.target_amount || 0);
    const annual = Number(details.annual_premium || summary.initial_capital || 0);
    const once = summary.premium_frequency === 'once';
    const payLabel = once ? 'единовременно' : 'раз в год';
    const program = 'Добра наживешь';
    const sumHtml = rubHtml(coverage);
    const payHtml = rubHtml(annual);
    const termHtml = `${years}&nbsp;${yearWord(years)}`;
    const tariffPct = coverage > 0 && annual > 0
        ? `${(annual / coverage * 100).toFixed(2).replace('.', ',')}%`
        : '—';
    const frequency = once ? 'Единовременно' : 'Ежегодно';

    const cards = [
        ['Дожитие', sumHtml],
        ['Смерть ЛП', 'в договоре'],
        ['Смерть НС', 'в договоре'],
        ['Смерть ДТП', 'в договоре'],
        ['Телемедицина', 'в договоре'],
    ].map(([name, value]) => `<div class="finam-v2-life__risk">
        ${lifeShieldIcon()}
        <div class="finam-v2-life__risk-name">${escapeHtml(name)}</div>
        <div class="finam-v2-life__risk-value">${value}</div>
      </div>`).join('\n');

    let out = String(html || '');
    out = replaceMarked(out, 'data-finam-v2-field', 'life-ai-intro', `<div class="finam-v2-life__bubble" data-finam-v2-field="life-ai-intro">
        <p><strong>«${program}»</strong> — программа ПСБ Жизнь на срок от 5 до 25 лет. К концу договора клиент получает страховую сумму. Взнос ${payLabel} считается по тарифу выбранного срока. Смерть, телемедицина и инвалидность ОУСВ входят в договор и к взносу не прибавляются.</p>
      </div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-kicker', `<div class="finam-v2-life__kicker" data-finam-v2-field="life-kicker">ПСБ Жизнь</div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-subtitle', `<p class="finam-v2-life__subtitle" data-finam-v2-field="life-subtitle">
          В этом плане — ${termHtml}. Страховая сумма ${sumHtml}, взнос ${payHtml} ${payLabel}. Чем длиннее срок, тем ниже тариф года.
        </p>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-product-line', `<p class="finam-v2-life__product-line" data-finam-v2-field="life-product-line">
          Продукт: <strong>${program}</strong>
        </p>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-product-name', `<div class="finam-v2-life__product-name" data-finam-v2-field="life-product-name">${program}</div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-risk-kicker', `<p class="finam-v2-life__section-kicker" data-finam-v2-field="life-risk-kicker">Что входит в программу</p>`);
    out = replaceMarked(out, 'data-finam-v2-block', 'life-risk-grid', `<div class="finam-v2-life__risk-grid" data-finam-v2-block="life-risk-grid">
      ${cards}
    </div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-annual-premium', `<div class="finam-v2-life__kpi-value" data-finam-v2-field="life-annual-premium">${payHtml}</div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-monthly-premium', `<div class="finam-v2-life__kpi-value" data-finam-v2-field="life-monthly-premium">${termHtml}</div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-product-annual', `<div class="finam-v2-life__product-row" data-finam-v2-field="life-product-annual"><span>Взнос ${once ? 'единовременно' : 'в год'}</span><span>${payHtml}</span></div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-product-frequency', `<div class="finam-v2-life__product-row" data-finam-v2-field="life-product-frequency"><span>Периодичность</span><span>${frequency}</span></div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-tariff', `<div class="finam-v2-life__rate-value" data-finam-v2-field="life-tariff">${tariffPct}</div>`);
    out = out.replace('Пополнение в мес', 'Срок');
    out = out.replace('Инструмент закрывает риск, а не просто добавляет взнос', 'Накопление к сроку и защита в одной программе');
    out = replaceMarked(out, 'data-finam-v2-field', 'life-product-monthly', `<div class="finam-v2-life__product-row" data-finam-v2-field="life-product-monthly"><span>Срок программы</span><span>${termHtml}</span></div>`);
    out = replaceMarked(out, 'data-finam-v2-field', 'life-ai-conclusion', `<div class="finam-v2-life__comment" data-finam-v2-field="life-ai-conclusion">
        <p><strong>Как читать страницу.</strong> По дожитию в конце срока выплачивается страховая сумма. Покрытия на случай смерти, телемедицина и ОУСВ стоят в тарифе с нулём и взнос не увеличивают. Отдельный размер выплаты по ним в программе не опубликован.</p>
      </div>`);
    return out;
}

module.exports = {
    isPsbReport,
    applyPsbReportBranding,
    applyPsbLifeGoalCopy,
    replacePsbEquityPage,
    replacePsbBondsPage,
    replacePsbMixedPage,
    replacePsbBrokerPage,
    replacePsbNpfBrokerPage,
};
