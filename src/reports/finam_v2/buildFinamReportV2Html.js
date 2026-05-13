const fs = require('fs');
const path = require('path');
const {
    FINAM_REPORT_V2_DYNAMIC_PAGE_TYPES,
    FINAM_REPORT_V2_PAGE_TYPES,
    FINAM_REPORT_V2_SAMPLE_PAYLOAD,
    FINAM_REPORT_V2_SCHEMA_VERSION,
    validateFinamReportV2Payload,
} = require('./finamReportV2Contract');

const FINAM_V2_DIR = __dirname;

function readLocalCss(fileName) {
    return fs.readFileSync(path.join(FINAM_V2_DIR, fileName), 'utf8');
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderList(items = []) {
    return `<ul class="finam-v2-wow__list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderHeader(label) {
    return `
    <header class="finam-v2-wow__header">
      <div class="finam-v2-wow__header-left">
        <span class="finam-v2-wow__header-dot" aria-hidden="true"></span>
        <span class="finam-v2-wow__header-label">Финансовый план</span>
      </div>
      <span class="finam-v2-wow__pill">${escapeHtml(label)}</span>
    </header>
    <hr class="finam-v2-wow__rule" />`;
}

function wrapPage(label, body) {
    return `<article class="finam-v2-page">
${renderHeader(label)}
${body}
    <hr class="finam-v2-wow__footer-rule" />
    <footer class="finam-v2-wow__footer">
      <span>Персональный финансовый план · Конфиденциально</span>
      <span class="finam-v2-wow__footer-right">${escapeHtml(label)}</span>
    </footer>
  </article>`;
}

function renderExecutiveSummary(payload) {
    const summary = payload.executiveSummary || {};
    const actions = summary.actions || [];

    return wrapPage(
        'Управленческий вывод',
        `
    <p class="finam-v2-wow__eyebrow">Ключевой вывод плана</p>
    <h1 class="finam-v2-wow__headline">${escapeHtml(summary.headline)}</h1>
    <p class="finam-v2-wow__lead">${escapeHtml(summary.lead)}</p>
    <section class="finam-v2-wow__split">
      <div class="finam-v2-wow__insight"><strong>Ключевой риск:</strong> ${escapeHtml(summary.primaryRisk)}</div>
      <div class="finam-v2-wow__score">
        <div class="finam-v2-wow__score-value">${escapeHtml(summary.healthScore)}</div>
        <div class="finam-v2-wow__score-label">индекс финансовой устойчивости из 10</div>
      </div>
    </section>
    <div class="finam-v2-wow__grid-3">
      ${actions
          .map(
              (action, index) => `<section class="finam-v2-wow__card">
        <div class="finam-v2-wow__card-title">Шаг ${index + 1}</div>
        <p class="finam-v2-wow__card-body">${escapeHtml(action)}</p>
      </section>`
          )
          .join('')}
    </div>
    <section class="finam-v2-wow__card finam-v2-wow__card--green">
      <div class="finam-v2-wow__card-title">Рекомендованный сценарий</div>
      <p class="finam-v2-wow__card-body">${escapeHtml(summary.recommendedScenario)}</p>
    </section>`
    );
}

function renderRiskPill(level) {
    const riskLevel = String(level || '').toLowerCase();
    const modifier = riskLevel.includes('high')
        ? ' finam-v2-risk-memo__risk-tag--warn'
        : '';
    return `<span class="finam-v2-risk-memo__risk-tag${modifier}">${escapeHtml(level || 'medium')}</span>`;
}

function renderRiskReturnMatrix() {
    return `
    <p class="finam-v2-risk-memo__section-title">Риск / доходность</p>
    <section class="finam-v2-risk-memo__matrix">
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Риск / доходность</div>
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Низкая доходность</div>
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Средняя доходность</div>
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Высокая доходность</div>
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Высокий риск</div>
      <div class="finam-v2-risk-memo__matrix-cell"></div>
      <div class="finam-v2-risk-memo__matrix-cell"></div>
      <div class="finam-v2-risk-memo__matrix-cell">${renderRiskPill('акции')}</div>
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Средний риск</div>
      <div class="finam-v2-risk-memo__matrix-cell"></div>
      <div class="finam-v2-risk-memo__matrix-cell">${renderRiskPill('ДУ')}${renderRiskPill('облигации')}</div>
      <div class="finam-v2-risk-memo__matrix-cell">${renderRiskPill('автоследование')}</div>
      <div class="finam-v2-risk-memo__matrix-cell finam-v2-risk-memo__matrix-head">Низкий риск</div>
      <div class="finam-v2-risk-memo__matrix-cell">${renderRiskPill('депозит')}${renderRiskPill('накопительный счёт')}</div>
      <div class="finam-v2-risk-memo__matrix-cell">${renderRiskPill('ПДС')}</div>
      <div class="finam-v2-risk-memo__matrix-cell"></div>
    </section>`;
}

function renderRiskDeclaration(payload) {
    const riskDeclaration = payload.riskDeclaration || {};
    const companiesById = new Map((payload.companies || []).map((company) => [company.id, company]));
    const products = payload.products || [];
    const risks = riskDeclaration.riskRegister || [];
    const companyLabelForProduct = (product) => {
        if (['bonds', 'equities'].includes(product.type)) {
            return 'класс активов / брокерский контур';
        }
        const company = companiesById.get(product.companyId) || {};
        return company.name || product.companyId;
    };
    const productRows = products
        .map((product) => {
            return `<tr>
          <td><strong>${escapeHtml(product.name)}</strong></td>
          <td>${escapeHtml(companyLabelForProduct(product))}</td>
          <td>${escapeHtml(product.role)}</td>
          <td>${escapeHtml(product.exposure || '')}</td>
          <td>${escapeHtml(product.allocationPercent == null ? '' : `${product.allocationPercent}%`)}</td>
        </tr>`;
        })
        .join('');
    const renderRiskCards = (items) => items
        .map(
            (risk) => `<div class="finam-v2-risk-memo__card">
        <p class="finam-v2-risk-memo__card-title">${escapeHtml(risk.title)}</p>
        <p class="finam-v2-risk-memo__card-text">${escapeHtml(risk.clientMessage)}</p>
        <p class="finam-v2-risk-memo__section-title">Остаточный риск</p>
        ${renderRiskPill(risk.residualRisk)}
        <p class="finam-v2-risk-memo__section-title">Контроль</p>
        <ul class="finam-v2-risk-memo__mini-list">
          ${(risk.controls || []).map((control) => `<li>${escapeHtml(control)}</li>`).join('')}
        </ul>
      </div>`
        )
        .join('');
    const topRiskRows = (riskDeclaration.topRisks || [])
        .map((risk, index) => {
            const registerItem = risks[index] || {};
            return `<tr>
          <td><strong>${escapeHtml(risk)}</strong></td>
          <td>${renderRiskPill(registerItem.residualRisk || riskDeclaration.summaryRiskLevel)}</td>
          <td>${escapeHtml(registerItem.exposure || 'весь план')}</td>
          <td>${escapeHtml(registerItem.clientMessage || 'требует регулярного контроля')}</td>
        </tr>`;
        })
        .join('');
    const marketRisks = risks.filter((risk) => risk.category === 'market');
    const productRisks = risks.filter((risk) => risk.category === 'product');
    const behavioralRisks = risks.filter((risk) => risk.category === 'behavioral');
    const reviewTriggers = [...new Set(risks.flatMap((risk) => risk.reviewTriggers || []))];
    const legalNotes = (riskDeclaration.legalNotes || [])
        .map((note) => escapeHtml(note))
        .join(' ');

    return [
        wrapPage(
            'Риски плана · 1/5',
            `
    <p class="finam-v2-wow__eyebrow">Декларация о рисках</p>
    <h1 class="finam-v2-wow__headline">${escapeHtml(riskDeclaration.headline)}</h1>
    <div class="finam-v2-risk-memo__hero">
      <div>
        <p class="finam-v2-wow__lead">Риск-декларация связывает продукты, компании, цели и меры контроля, а не живёт отдельным юридическим приложением.</p>
        <section class="finam-v2-risk-memo__note"><strong>Контрольный ритм:</strong> ${escapeHtml(riskDeclaration.reviewCadence)}</section>
      </div>
      <aside class="finam-v2-risk-memo__score">
        <div class="finam-v2-risk-memo__score-value">${escapeHtml(riskDeclaration.summaryRiskLevel || 'medium')}</div>
        <div class="finam-v2-risk-memo__score-label">остаточный риск после диверсификации и контроля</div>
      </aside>
    </div>
    <div class="finam-v2-risk-memo__kpi-row">
      <section class="finam-v2-risk-memo__kpi"><div class="finam-v2-risk-memo__kpi-value">${products.length}</div><div class="finam-v2-risk-memo__kpi-label">продуктов</div></section>
      <section class="finam-v2-risk-memo__kpi"><div class="finam-v2-risk-memo__kpi-value">${(payload.companies || []).length}</div><div class="finam-v2-risk-memo__kpi-label">компании / платформы</div></section>
      <section class="finam-v2-risk-memo__kpi"><div class="finam-v2-risk-memo__kpi-value">${(riskDeclaration.riskRegister || []).length}</div><div class="finam-v2-risk-memo__kpi-label">материальных риска</div></section>
      <section class="finam-v2-risk-memo__kpi"><div class="finam-v2-risk-memo__kpi-value">90</div><div class="finam-v2-risk-memo__kpi-label">дней до первой сверки</div></section>
    </div>
    <table class="finam-v2-risk-memo__table">
      <thead><tr><th>Ключевой риск</th><th>Остаточный риск</th><th>Экспозиция</th><th>Сообщение клиенту</th></tr></thead>
      <tbody>${topRiskRows}</tbody>
    </table>`
        ),
        wrapPage(
            'Риски плана · 2/5',
            `
    <p class="finam-v2-wow__eyebrow">Карта экспозиции</p>
    <h1 class="finam-v2-wow__headline">Каждый риск привязан к продукту, провайдеру и цели</h1>
    <table class="finam-v2-risk-memo__table">
      <thead><tr><th>Продукт</th><th>Компания</th><th>Роль</th><th>Экспозиция</th><th>Доля</th></tr></thead>
      <tbody>${productRows}</tbody>
    </table>
    ${renderRiskReturnMatrix()}`
        ),
        wrapPage(
            'Риски плана · 3/5',
            `
    <p class="finam-v2-wow__eyebrow">Рыночный контур</p>
    <h1 class="finam-v2-wow__headline">Облигации и акции раскрываем как классы активов</h1>
    <p class="finam-v2-wow__lead">Если в плане нет конкретных бумаг, раздел не показывает аналитику конкретных эмитентов и не притворяется, что она есть.</p>
    <div class="finam-v2-risk-memo__two-col">${renderRiskCards(marketRisks)}</div>
    <section class="finam-v2-risk-memo__note"><strong>Принцип:</strong> риск класса активов объясняется через горизонт, дюрацию, ликвидность, волатильность и поведение клиента.</section>`
        ),
        wrapPage(
            'Риски плана · 4/5',
            `
    <p class="finam-v2-wow__eyebrow">Продуктовый контур</p>
    <h1 class="finam-v2-wow__headline">ПДС, ДУ и автоследование требуют разных контролей</h1>
    <div class="finam-v2-risk-memo__two-col">${renderRiskCards(productRisks.concat(behavioralRisks))}</div>
    <section class="finam-v2-risk-memo__note"><strong>Что сказать клиенту:</strong> продукт выбирается не потому, что он «лучший», а потому что его риск подходит цели, горизонту и денежному потоку.</section>`
        ),
        wrapPage(
            'Риски плана · 5/5',
            `
    <p class="finam-v2-wow__eyebrow">Протокол контроля</p>
    <h1 class="finam-v2-wow__headline">Риск контролируется календарём, а не обещаниями доходности</h1>
    <section class="finam-v2-risk-memo__three-col">
      <div class="finam-v2-risk-memo__card"><p class="finam-v2-risk-memo__card-title">Ежеквартально</p>${renderList(['Сверить целевые доли', 'Проверить пополнения', 'Обновить статус ДУ / автоследования'])}</div>
      <div class="finam-v2-risk-memo__card"><p class="finam-v2-risk-memo__card-title">Раз в 6 месяцев</p>${renderList(['Пересчитать инфляцию', 'Проверить ПДС, ликвидность и лимиты', 'Сверить риск-профиль'])}</div>
      <div class="finam-v2-risk-memo__card"><p class="finam-v2-risk-memo__card-title">По событию</p>${renderList(reviewTriggers.slice(0, 4))}</div>
    </section>
    <p class="finam-v2-tail__disclaimer">${legalNotes}</p>
    <p class="finam-v2-risk-memo__section-title">Преемственность с v1</p>
    <table class="finam-v2-risk-memo__table">
      <thead><tr><th>Риск v1</th><th>Где раскрыт в v2</th></tr></thead>
      <tbody>
        <tr><td>Инфляционный риск</td><td>триггер пересчёта целей и пополнений</td></tr>
        <tr><td>Риск НПФ</td><td>ПДС НПФ Ренессанс и правила программы</td></tr>
        <tr><td>ОФЗ / ставка</td><td>облигации: дюрация, ставка, ликвидность</td></tr>
        <tr><td>Акции РФ</td><td>акции как класс активов без конкретных бумаг</td></tr>
        <tr><td>Корпоративные облигации</td><td>кредитный риск в облигационном контуре</td></tr>
      </tbody>
    </table>
    <section class="finam-v2-risk-memo__note"><strong>Финальное решение:</strong> клиент принимает его после раскрытия рисков, проверки документов и сверки продуктов с личным риск-профилем.</section>`
        ),
    ].join('\n');
}

function renderRoadmap(payload) {
    const roadmap = payload.roadmap || [];

    return wrapPage(
        'Дорожная карта',
        `
    <p class="finam-v2-wow__eyebrow">Что делаем дальше</p>
    <h1 class="finam-v2-wow__headline">Дорожная карта превращает расчёт в программу действий</h1>
    <div class="finam-v2-wow__timeline">
      ${roadmap
          .map(
              (step, index) => `<section class="finam-v2-wow__step">
        <span class="finam-v2-wow__step-num">${index + 1}</span>
        <div class="finam-v2-wow__card-title">${escapeHtml(step.horizon)}</div>
        ${renderList(step.actions)}
      </section>`
          )
          .join('')}
    </div>`
    );
}

function renderPartnerValue(payload) {
    const partnerValue = payload.partnerValue || {};
    const layers = partnerValue.layers || [];

    return wrapPage(
        'Партнёрская ценность',
        `
    <p class="finam-v2-wow__eyebrow">Партнёрская ценность отчёта</p>
    <h1 class="finam-v2-wow__headline">${escapeHtml(partnerValue.headline)}</h1>
    <table class="finam-v2-wow__table">
      <thead><tr><th>Слой ценности</th><th>Что видит партнёр</th></tr></thead>
      <tbody>
        ${layers
            .map(
                ([name, value]) => `<tr>
          <td><strong>${escapeHtml(name)}</strong></td>
          <td>${escapeHtml(value)}</td>
        </tr>`
            )
            .join('')}
      </tbody>
    </table>
    <section class="finam-v2-wow__insight">
      <strong>Важное отличие:</strong> партнёр получает повторяемую премиальную упаковку, а не ручной дизайн каждого отчёта.
    </section>`
    );
}

const RENDERERS_BY_PAGE_TYPE = {
    [FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY]: renderExecutiveSummary,
    [FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION]: renderRiskDeclaration,
    [FINAM_REPORT_V2_PAGE_TYPES.ROADMAP]: renderRoadmap,
    [FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE]: renderPartnerValue,
};

function buildFinamReportV2Html(payload = FINAM_REPORT_V2_SAMPLE_PAYLOAD, options = {}) {
    const errors = validateFinamReportV2Payload(payload);
    if (errors.length) {
        throw new Error(`Invalid Finam Report v2 payload: ${errors.join('; ')}`);
    }

    const pageTypes = Array.isArray(options.pageTypes) && options.pageTypes.length
        ? options.pageTypes
        : FINAM_REPORT_V2_DYNAMIC_PAGE_TYPES;
    const unknownPageTypes = pageTypes.filter((pageType) => !RENDERERS_BY_PAGE_TYPE[pageType]);
    if (unknownPageTypes.length) {
        throw new Error(`Unsupported Finam Report v2 dynamic page types: ${unknownPageTypes.join(', ')}`);
    }

    const tokensCss = readLocalCss('tokens.css');
    const sharedCss = readLocalCss('page-wow-shared.css');
    const pages = pageTypes.map((pageType) => RENDERERS_BY_PAGE_TYPE[pageType](payload)).join('\n');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Финансовый план</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&amp;family=Source+Serif+4:wght@600;700&amp;display=swap"
  />
  <style>
${tokensCss}
${sharedCss}
@page { size: 595px 842px; margin: 0; }
body { flex-direction: column; align-items: center; gap: 32px; }
article.finam-v2-page { break-after: page; page-break-after: always; }
article.finam-v2-page:last-child { break-after: auto; page-break-after: auto; }
  </style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

module.exports = {
    buildFinamReportV2Html,
    escapeHtml,
};
