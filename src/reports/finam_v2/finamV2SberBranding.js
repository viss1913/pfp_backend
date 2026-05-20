/**
 * White-label Finam Report v2 для SBER (projectId 29): витрины акций/облигаций.
 * Общие page-*-v2.html Finam не меняются — подстановка при сборке HTML.
 */

const { SBER_SHOWCASE_CATALOG } = require('./finamV2SberProductCatalog');
const { isSberProject, SBER_PROJECT_ID } = require('./finamV2SberPageConfig');

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

function sberProductCardHtml(product) {
    const yieldText = product.yieldLabel ? `Ожид. доходность: ${product.yieldLabel}` : 'Доходность: уточняется';
    return `<article class="finam-v2-tail__product-card finam-v2-sber__product-card">
        <h2 class="finam-v2-tail__product-title">${escapeHtml(product.name)}</h2>
        <p class="finam-v2-tail__product-text">${escapeHtml(product.blurb)}</p>
        <div class="finam-v2-tail__chip-row">
          <span class="finam-v2-tail__chip finam-v2-tail__chip--accent">${escapeHtml(yieldText)}</span>
          <a class="finam-v2-tail__chip finam-v2-idu__link" href="${escapeAttr(product.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.linkLabel || 'Подробнее')}</a>
        </div>
      </article>`;
}

function sberShowcaseSectionHtml(section) {
    const cards = (Array.isArray(section.products) ? section.products : [])
        .map(sberProductCardHtml)
        .join('\n      ');
    return `<section class="finam-v2-sber__section" data-sber-showcase-section>
      <p class="finam-v2-tail__section-title">${escapeHtml(section.title)}</p>
      <section class="finam-v2-tail__card-grid finam-v2-sber__card-grid" data-sber-product-grid>${cards}</section>
    </section>`;
}

function tailPageHeader(pillText) {
    return `<header class="finam-v2-wow__header">
      <div class="finam-v2-wow__header-left">
        <span class="finam-v2-wow__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-wow__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-wow__pill">${escapeHtml(pillText)}</span>
    </header>
    <hr class="finam-v2-wow__rule" />`;
}

function tailFooter(rightNote) {
    return `<hr class="finam-v2-wow__footer-rule" />
    <footer class="finam-v2-wow__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-wow__footer-right">${escapeHtml(rightNote)}</span>
    </footer>`;
}

/**
 * @param {'equities'|'bonds'} assetKey
 */
function buildSberShowcasePage(assetKey) {
    const catalog = SBER_SHOWCASE_CATALOG[assetKey];
    if (!catalog) return '';
    const sectionsHtml = (catalog.sections || []).map(sberShowcaseSectionHtml).join('\n    ');
    const insightBody = String(catalog.insight || '').replace(/^Смысл блока:\s*/i, '');
    return `<article class="finam-v2-page finam-v2-sber-showcase-page">
    ${tailPageHeader(catalog.pill)}
    <section class="finam-v2-tail__hero finam-v2-tail__hero--full finam-v2-sber__hero">
      <div>
        <p class="finam-v2-wow__eyebrow">${escapeHtml(catalog.eyebrow)}</p>
        <h1 class="finam-v2-wow__headline">${escapeHtml(catalog.headline)}</h1>
        <p class="finam-v2-wow__lead finam-v2-sber__lead">${escapeHtml(catalog.lead)}</p>
      </div>
    </section>
    <section class="finam-v2-wow__insight finam-v2-sber__insight"><strong>Смысл блока:</strong> ${escapeHtml(insightBody)}</section>
    ${sectionsHtml}
    <p class="finam-v2-tail__disclaimer finam-v2-tail__page-note">${escapeHtml(catalog.disclaimer)}</p>
    ${tailFooter('Информация не является индивидуальной инвестиционной рекомендацией')}
  </article>`;
}

function replaceFinamV2PageArticles(html, replacer) {
    const src = String(html || '');
    const articleRe = /<article\b[^>]*class="[^"]*finam-v2-page[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
    let index = 0;
    return src.replace(articleRe, (article) => {
        const replacement = replacer(article, index);
        index += 1;
        return replacement != null && replacement !== '' ? replacement : article;
    });
}

function replaceSberEquitiesPage(html) {
    return replaceFinamV2PageArticles(html, (_article, index) =>
        index === 0 ? buildSberShowcasePage('equities') : ''
    );
}

function replaceSberBondsPage(html) {
    return replaceFinamV2PageArticles(html, (_article, index) =>
        index === 0 ? buildSberShowcasePage('bonds') : ''
    );
}

/** Фаза 2: зелёная палитра Сбера. Пока без изменений. */
function applySberReportBranding(html) {
    return String(html || '');
}

module.exports = {
    SBER_PROJECT_ID,
    isSberProject,
    buildSberShowcasePage,
    replaceSberEquitiesPage,
    replaceSberBondsPage,
    applySberReportBranding,
};
