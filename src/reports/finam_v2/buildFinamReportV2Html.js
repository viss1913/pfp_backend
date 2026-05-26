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

const DEMO_PROD_CSS = `
.finam-v2-prod__kicker { font-size: 9px; font-weight: 700; color: var(--finam-v2-color-accent-blue); text-transform: uppercase; letter-spacing: .09em; margin-bottom: 8px; }
.finam-v2-prod__title { font-family: var(--finam-v2-font-display), Georgia, serif; font-size: 30px; line-height: 1.05; color: var(--finam-v2-color-navy-deep); margin: 0 0 12px; letter-spacing: -0.03em; }
.finam-v2-prod__lead { font-size: 12px; line-height: 1.45; color: var(--finam-v2-color-text-soft); margin: 0 0 16px; max-width: 480px; }
.finam-v2-prod__grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.finam-v2-prod__grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.finam-v2-prod__card { border: 1px solid var(--finam-v2-color-border); border-radius: 12px; background: #fff; padding: 12px; }
.finam-v2-prod__card--soft { background: var(--finam-v2-color-soft-gray); }
.finam-v2-prod__card--green { background: #ecfdf5; border-color: #d1fae5; }
.finam-v2-prod__label { font-size: 8px; line-height: 1.2; color: var(--finam-v2-color-text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
.finam-v2-prod__text { font-size: 10px; line-height: 1.38; color: var(--finam-v2-color-text-soft); margin: 0; }
.finam-v2-prod__list { margin: 0; padding-left: 15px; font-size: 9.5px; line-height: 1.4; color: var(--finam-v2-color-text-soft); }
.finam-v2-prod__list li { margin: 0 0 5px; }
`;

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

function renderRiskDeclaration(payload) {
    const riskDeclaration = payload.riskDeclaration || {};
    const legalNotes = (Array.isArray(riskDeclaration.legalNotes) && riskDeclaration.legalNotes.length
        ? riskDeclaration.legalNotes
        : [
            'Материалы декларации носят информационный характер и не являются индивидуальной инвестиционной рекомендацией (ИИР).',
            'Прошлая доходность не гарантирует будущие результаты.',
            'Финансовые, пенсионные, брокерские и страховые условия, порядок гарантий, комиссии, ограничения и выплаты определяются действующим законодательством РФ, правилами провайдеров и документами конкретных продуктов.',
        ])
        .map((note) => escapeHtml(note))
        .join(' ');

    return [
        wrapPage(
            'Риски плана · 1/5',
            `
    <p class="finam-v2-prod__kicker">Декларация о рисках</p>
    <h1 class="finam-v2-prod__title">Информация для клиента по финансовому плану</h1>
    <div class="finam-v2-prod__grid-2" style="grid-template-columns:minmax(0,1fr) 154px; align-items:stretch; margin-bottom:10px;">
      <section class="finam-v2-prod__card">
        <p class="finam-v2-prod__lead" style="margin-bottom:8px;">Настоящая декларация подготовлена с целью объяснить ключевые риски, связанные с финансовым планом, инвестиционными решениями и страховыми продуктами.</p>
        <p class="finam-v2-prod__text">Любые инвестиции и финансовые инструменты предполагают возможность как получения дохода, так и возникновения убытков.</p>
      </section>
      <section class="finam-v2-prod__card" style="background:#eff6ff;border-color:#dbeafe;">
        <p class="finam-v2-prod__text"><strong>Важно понимать:</strong> хранение капитала исключительно в денежной форме также несет риски, прежде всего риск инфляции и постепенного снижения покупательной способности денежных средств.</p>
      </section>
    </div>
    <div class="finam-v2-prod__grid-3" style="margin-bottom:10px;">
      <section class="finam-v2-prod__card"><div class="finam-v2-prod__label">Доход и убыток</div><p class="finam-v2-prod__text">Доходность не гарантирована, а финансовый результат зависит от горизонта, структуры и рыночной среды.</p></section>
      <section class="finam-v2-prod__card"><div class="finam-v2-prod__label">Реальная стоимость</div><p class="finam-v2-prod__text">Даже номинально сохраненный капитал может терять покупательную способность.</p></section>
      <section class="finam-v2-prod__card"><div class="finam-v2-prod__label">Контроль плана</div><p class="finam-v2-prod__text">Финансовый план требует регулярного пересмотра, ребалансировки и сверки рисков с целями клиента.</p></section>
    </div>
    <section class="finam-v2-prod__card">
      <div class="finam-v2-prod__label">1. Инфляционный риск</div>
      <p class="finam-v2-prod__text">Инфляция — это постепенное снижение покупательной способности денежных средств. Даже при сохранении номинальной суммы капитала его реальная стоимость со временем уменьшается.</p>
      <div class="finam-v2-prod__label" style="margin-top:8px;">Что происходит</div>
      <ul class="finam-v2-prod__list">
        <li>накопления теряют свою покупательную способность;</li>
        <li>доходность консервативных инструментов оказывается ниже инфляции;</li>
        <li>для достижения финансовых целей в будущем потребуется существенно больший капитал.</li>
      </ul>
      <div class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top:8px;padding:10px 11px;">
        <p class="finam-v2-prod__text"><strong>Почему это важно:</strong> особенно значим данный риск при долгосрочном финансовом планировании, когда срок реализации цели составляет годы, а иногда и десятилетия.</p>
      </div>
      <div class="finam-v2-prod__label" style="margin-top:8px;">Меры снижения риска</div>
      <ul class="finam-v2-prod__list">
        <li>распределение капитала между различными финансовыми инструментами;</li>
        <li>использование решений с потенциальной доходностью выше инфляции;</li>
        <li>регулярный пересмотр финансового плана;</li>
        <li>долгосрочный подход, поэтапное инвестирование и ребалансировка портфеля.</li>
      </ul>
    </section>`
        ),
        wrapPage(
            'Риски плана · 2/5',
            `
    <p class="finam-v2-prod__kicker">Инвестиционный контур</p>
    <h1 class="finam-v2-prod__title">Рыночный риск и риск повышенной волатильности</h1>
    <section class="finam-v2-prod__card" style="margin-bottom:10px;">
      <div class="finam-v2-prod__label">2. Рыночный риск</div>
      <p class="finam-v2-prod__text">Стоимость инвестиционных активов может как расти, так и снижаться под влиянием экономической ситуации, процентных ставок, действий Центрального Банка, геополитических факторов, корпоративных событий и изменений настроений участников рынка.</p>
      <p class="finam-v2-prod__text" style="margin-top:7px;">Инвестиционные продукты, включая автоследование, доверительное управление и стратегии с акциями и производными инструментами, могут показывать временные или существенные просадки. Прошлая доходность не гарантирует результатов в будущем.</p>
      <div class="finam-v2-prod__label" style="margin-top:8px;">Меры снижения риска</div>
      <ul class="finam-v2-prod__list">
        <li>диверсификация между различными инструментами;</li>
        <li>ограничение доли высокорисковых активов;</li>
        <li>долгосрочный горизонт инвестирования;</li>
        <li>регулярный контроль структуры портфеля и использование риск-менеджмента.</li>
      </ul>
    </section>
    <section class="finam-v2-prod__card">
      <div class="finam-v2-prod__label">3. Риск повышенной волатильности и убытков по стратегиям автоследования</div>
      <p class="finam-v2-prod__text">Стратегии автоследования могут использовать акции, фьючерсы, производные финансовые инструменты и активные торговые стратегии.</p>
      <ul class="finam-v2-prod__list">
        <li>высокая волатильность и резкие колебания стоимости;</li>
        <li>возможность временных и существенных убытков;</li>
        <li>повышенная чувствительность к рыночным движениям;</li>
        <li>доходность стратегии может существенно отличаться от ожиданий клиента.</li>
      </ul>
      <div class="finam-v2-prod__label" style="margin-top:8px;">Меры снижения риска</div>
      <ul class="finam-v2-prod__list">
        <li>ограничение доли капитала в агрессивных стратегиях;</li>
        <li>распределение активов между разными уровнями риска;</li>
        <li>соблюдение инвестиционного горизонта;</li>
        <li>регулярный мониторинг стратегии и использование приемлемого уровня риска.</li>
      </ul>
    </section>`
        ),
        wrapPage(
            'Риски плана · 3/5',
            `
    <p class="finam-v2-prod__kicker">Контрагент и ликвидность</p>
    <h1 class="finam-v2-prod__title">Кредитный, корпоративный, ликвидный и регуляторный контур</h1>
    <section class="finam-v2-prod__card" style="padding:10px 11px;margin-bottom:8px;">
      <div class="finam-v2-prod__label">4. Кредитный и корпоративный риск</div>
      <p class="finam-v2-prod__text">Финансовые организации, эмитенты ценных бумаг и иные контрагенты могут столкнуться с ухудшением финансового положения, ограничением операций, дефолтом, изменением условий обслуживания и снижением надежности.</p>
      <p class="finam-v2-prod__text" style="margin-top:6px;">Это может повлиять на стоимость активов и исполнение обязательств.</p>
      <div class="finam-v2-prod__label" style="margin-top:6px;">Меры снижения риска</div>
      <ul class="finam-v2-prod__list"><li>использование регулируемых финансовых организаций;</li><li>распределение капитала между несколькими инструментами;</li><li>регулярный пересмотр структуры активов и ограничение концентрации.</li></ul>
    </section>
    <section class="finam-v2-prod__card" style="padding:10px 11px;margin-bottom:8px;">
      <div class="finam-v2-prod__label">5. Риск ликвидности</div>
      <ul class="finam-v2-prod__list">
        <li>отдельные инструменты могут иметь ограниченную ликвидность;</li>
        <li>временно быть недоступны для продажи;</li>
        <li>реализовываться только с дисконтом к рыночной стоимости.</li>
      </ul>
      <p class="finam-v2-prod__text" style="margin-top:6px;">Особенно данный риск возрастает в периоды нестабильности на финансовых рынках.</p>
      <div class="finam-v2-prod__label" style="margin-top:6px;">Меры снижения риска</div>
      <ul class="finam-v2-prod__list"><li>формирование резервного капитала;</li><li>распределение средств между инструментами с различной ликвидностью;</li><li>отказ от чрезмерной концентрации активов и планирование инвестиционного горизонта.</li></ul>
    </section>
    <section class="finam-v2-prod__card" style="padding:10px 11px;">
      <div class="finam-v2-prod__label">6. Регуляторный и налоговый риск</div>
      <p class="finam-v2-prod__text">Законодательство, налоговые правила и регулирование финансового рынка могут изменяться. Это способно повлиять на налогообложение, условия финансовых продуктов, порядок обслуживания и итоговую доходность инвестиций.</p>
      <div class="finam-v2-prod__label" style="margin-top:6px;">Меры снижения риска</div>
      <ul class="finam-v2-prod__list"><li>регулярный пересмотр финансового плана;</li><li>адаптация структуры активов к изменениям законодательства;</li><li>использование официально регулируемых финансовых инструментов и организаций.</li></ul>
    </section>`
        ),
        wrapPage(
            'Риски плана · 4/5',
            `
    <p class="finam-v2-prod__kicker">Страховая защита</p>
    <h1 class="finam-v2-prod__title">7. Риски страховых продуктов</h1>
    <section class="finam-v2-prod__card">
      <p class="finam-v2-prod__text">Программы страхования жизни и страховой защиты имеют условия действия, ограничения, исключения, сроки ожидания и установленный перечень страховых случаев.</p>
      <p class="finam-v2-prod__text" style="margin-top:6px;">Страховая выплата осуществляется исключительно в соответствии с условиями договора страхования.</p>
      <div class="finam-v2-prod__grid-2" style="margin-top:8px;align-items:start;">
        <div>
          <div class="finam-v2-prod__label">Когда выплата может быть ограничена</div>
          <ul class="finam-v2-prod__list">
            <li>если событие не признается страховым случаем;</li>
            <li>при предоставлении недостоверной информации;</li>
            <li>при наличии заболеваний или травм, существовавших до заключения договора;</li>
            <li>при умышленных действиях застрахованного лица;</li>
            <li>в случаях алкогольного или наркотического опьянения;</li>
            <li>при участии в противоправных действиях, военных действиях, массовых беспорядках или террористической деятельности;</li>
            <li>в иных случаях, предусмотренных правилами страхования.</li>
          </ul>
        </div>
        <div>
          <div class="finam-v2-prod__label">Меры снижения риска</div>
          <ul class="finam-v2-prod__list">
            <li>внимательное ознакомление с условиями договора страхования;</li>
            <li>корректное и полное раскрытие информации при оформлении полиса;</li>
            <li>соблюдение условий страхования;</li>
            <li>подбор страховой программы под цели клиента;</li>
            <li>регулярный пересмотр страхового покрытия.</li>
          </ul>
          <section class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top:8px;padding:10px 11px;">
            <p class="finam-v2-prod__text"><strong>Дополнительно:</strong> досрочное прекращение договора также может привести к финансовым потерям.</p>
          </section>
        </div>
      </div>
    </section>`
        ),
        wrapPage(
            'Риски плана · 5/5',
            `
    <p class="finam-v2-prod__kicker">Финансовая устойчивость и ожидания</p>
    <h1 class="finam-v2-prod__title">Организации, ожидания клиента и итоговый вывод</h1>
    <section class="finam-v2-prod__card" style="padding:9px 10px;margin-bottom:8px;">
      <div class="finam-v2-prod__label">8. Риск финансовой устойчивости финансовых организаций</div>
      <p class="finam-v2-prod__text">Несмотря на государственное регулирование и контроль со стороны Банка России, финансовые организации могут столкнуться с ухудшением финансового положения, ограничением деятельности, отзывом лицензии, санацией или банкротством.</p>
      <p class="finam-v2-prod__text" style="margin-top:6px;">Данный риск относится к НПФ, брокерским компаниям, страховым организациям, управляющим компаниям и иным финансовым посредникам.</p>
      <div class="finam-v2-prod__grid-2" style="margin-top:7px;align-items:start;gap:8px;">
        <div>
          <div class="finam-v2-prod__label">Возможные последствия</div>
          <ul class="finam-v2-prod__list">
            <li>временные ограничения доступа к активам;</li>
            <li>задержки операций и выплат;</li>
            <li>необходимость перевода активов к другому участнику рынка;</li>
            <li>финансовые потери по отдельным продуктам и услугам.</li>
          </ul>
        </div>
        <div>
          <div class="finam-v2-prod__label">Меры снижения риска</div>
          <ul class="finam-v2-prod__list">
            <li>использование регулируемых финансовых организаций;</li>
            <li>диверсификация капитала между различными организациями и инструментами;</li>
            <li>ограничение концентрации средств в одной компании;</li>
            <li>регулярный пересмотр структуры финансового плана и используемых продуктов.</li>
          </ul>
        </div>
      </div>
      <section class="finam-v2-prod__card finam-v2-prod__card--soft" style="margin-top:7px;padding:9px 10px;">
        <p class="finam-v2-prod__text"><strong>Важно:</strong> активы на брокерском счете учитываются отдельно от имущества брокера и регистрируются в депозитарной системе на имя клиента. Ценные бумаги не являются собственностью брокера и не включаются в конкурсную массу при его банкротстве. Средства ПДС, размещенные через НПФ, подлежат государственной системе гарантирования в пределах, установленных законодательством РФ (на текущий момент — до 2,8 млн рублей).</p>
      </section>
    </section>
    <div class="finam-v2-prod__grid-2" style="gap:7px;">
      <section class="finam-v2-prod__card" style="padding:9px 10px;">
        <div class="finam-v2-prod__label">9. Риск несоответствия ожиданий</div>
        <p class="finam-v2-prod__text">Фактическая доходность инвестиций может отличаться от прогнозируемой или ожидаемой. Финансовый план строится на предположениях, сценариях и расчетах, которые не гарантируют конкретный результат.</p>
        <div class="finam-v2-prod__label" style="margin-top:6px;">Меры снижения риска</div>
        <ul class="finam-v2-prod__list"><li>формирование реалистичных ожиданий;</li><li>долгосрочный подход к инвестированию;</li><li>регулярная корректировка финансового плана;</li><li>контроль рисков и диверсификация.</li></ul>
      </section>
      <section class="finam-v2-prod__card finam-v2-prod__card--green" style="padding:9px 10px;">
        <div class="finam-v2-prod__label">Важное заключение</div>
        <p class="finam-v2-prod__text">Финансовый план направлен не на полное исключение рисков, а на их разумное управление.</p>
        <p class="finam-v2-prod__text" style="margin-top:6px;">Основная задача стратегии — создать устойчивую систему управления капиталом, которая:</p>
        <ul class="finam-v2-prod__list"><li>учитывает цели клиента;</li><li>помогает снижать влияние инфляции;</li><li>распределяет риски;</li><li>формирует долгосрочную финансовую устойчивость;</li><li>обеспечивает финансовую защиту семьи и капитала.</li></ul>
      </section>
    </div>
    <p class="finam-v2-tail__disclaimer" style="margin-top:6px;font-size:7.8px;line-height:1.24;color:#475569;">${legalNotes}</p>`
        ),
    ].join('\n');
}

function renderRoadmap(payload) {
    const roadmap = payload.roadmap || [];

    return wrapPage(
        'Дорожная карта',
        `
    <p class="finam-v2-wow__eyebrow">Что делаем дальше</p>
    <h1 class="finam-v2-wow__headline" style="font-size:26px;line-height:1.03;max-width:470px;margin-bottom:6px;">Дорожная карта превращает расчёт в программу действий</h1>
    <div class="finam-v2-wow__timeline" style="gap:10px;margin-bottom:8px;">
      ${roadmap
          .map(
              (step, index) => `<section class="finam-v2-wow__step" style="padding:10px;">
        <span class="finam-v2-wow__step-num">${index + 1}</span>
        <div class="finam-v2-wow__card-title" style="font-size:14px;line-height:1.1;margin-bottom:7px;">${escapeHtml(step.horizon)}</div>
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
${DEMO_PROD_CSS}
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
