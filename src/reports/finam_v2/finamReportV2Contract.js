const FINAM_REPORT_V2_SCHEMA_VERSION = 'finam-v2.0';

const FINAM_REPORT_V2_PAGE_TYPES = Object.freeze({
    COVER: 'cover',
    EXECUTIVE_SUMMARY: 'executiveSummary',
    INTRO: 'intro',
    CURRENT_STATE: 'currentState',
    GOALS: 'goals',
    PORTFOLIO_SUMMARY: 'portfolioSummary',
    TAX_PLANNING: 'taxPlanning',
    COMON_AUTOFOLLOW: 'comonAutofollow',
    IDU_STRATEGIES: 'iduStrategies',
    FINAM_OFFERS: 'finamOffers',
    SBER_EQUITIES_SHOWCASE: 'sberEquitiesShowcase',
    SBER_BONDS_SHOWCASE: 'sberBondsShowcase',
    INFLATION: 'inflation',
    RISK_DECLARATION: 'riskDeclaration',
    DETAILED_PLAN: 'detailedPlan',
    SCENARIOS: 'scenarios',
    ROADMAP: 'roadmap',
    GOAL_FIN_RESERVE: 'goalFinReserve',
    GOAL_LIFE: 'goalLife',
    GOAL_PENSION: 'goalPension',
    GOAL_PASSIVE_INCOME: 'goalPassiveIncome',
    GOAL_SAVE_GROW: 'goalSaveGrow',
    GOAL_INHERITANCE: 'goalInheritance',
    GOAL_OTHER: 'goalOther',
    PARTNER_VALUE: 'partnerValue',
});

// Manifest order for available v2 page types. A real composer must filter goal pages
// by the client's actual goals before rendering.
const FINAM_REPORT_V2_DEFAULT_ORDER = Object.freeze([
    FINAM_REPORT_V2_PAGE_TYPES.COVER,
    FINAM_REPORT_V2_PAGE_TYPES.INTRO,
    FINAM_REPORT_V2_PAGE_TYPES.CURRENT_STATE,
    FINAM_REPORT_V2_PAGE_TYPES.GOALS,
    FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_INHERITANCE,
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
    FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING,
    FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
    FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES,
    FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS,
    FINAM_REPORT_V2_PAGE_TYPES.INFLATION,
    FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
    FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN,
    FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
    FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
]);

const FINAM_REPORT_V2_DYNAMIC_PAGE_TYPES = Object.freeze([
    FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
    FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
    FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
]);

const FINAM_REPORT_V2_TYPOGRAPHY_LIMITS = Object.freeze({
    bodyMinPx: 9,
    captionMinPx: 8,
    footerTargetPx: 8,
    chartAxisMinPx: 8,
});

/** Пример блока ИФУС для ЛК / JSON (buildV2Model → executiveDecision.ifus). */
const FINAM_REPORT_V2_SAMPLE_IFUS = Object.freeze({
    totalScore: 7.2,
    totalScoreFormatted: '7,2',
    baseScore: 7.6,
    penaltySum: 0.4,
    band: { id: 'high', label: 'Высокая устойчивость', range: '7–8,4' },
    reserveMonths: 5.2,
    reserveMonthsFormatted: '5,2',
    targetReserveMonths: 6,
    liquidRub: 936000,
    mandatoryMonthlyRub: 180000,
    monthlyDebtRub: 22000,
    dsr: 0.122,
    dsrPercentFormatted: '12,2',
    freeCashflowRatio: 0.28,
    lifeCoverageRatio: 0.85,
    hasLifeGoal: true,
    projectedCapitalLabel: '42,0 млн ₽',
    factors: [
        { id: 'reserve', title: 'Финансовый резерв', weight: 0.25, score: 7.5, contribution: 1.875 },
        { id: 'dsr', title: 'Долговая нагрузка (DSR)', weight: 0.2, score: 8, contribution: 1.6 },
        { id: 'scf', title: 'Свободный cash flow', weight: 0.2, score: 7, contribution: 1.4 },
        { id: 'life', title: 'Страховая защита жизни', weight: 0.15, score: 7.5, contribution: 1.125 },
        { id: 'netWorth', title: 'Чистый капитал', weight: 0.1, score: 7, contribution: 0.7 },
        { id: 'housing', title: 'Жилищная устойчивость', weight: 0.05, score: 7, contribution: 0.35 },
        { id: 'goals', title: 'Защищённость финансовых целей', weight: 0.05, score: 8, contribution: 0.4 },
    ],
    penalties: [{ code: 'reserve_below_1mo', points: 0.4, label: 'Резерв менее 1 мес. обязательных расходов' }],
    alerts: [{ level: 'info', text: 'Резерв ~5,2 мес. обязательных расходов — по профилю семьи ориентир 6 мес.' }],
    dataGaps: [],
});

/** Пример executiveDecision (страница 5) для фронта — нарратив + ИФУС. */
const FINAM_REPORT_V2_SAMPLE_EXECUTIVE_DECISION = Object.freeze({
    scenario: 'cashflow_working',
    headline: 'План рабочий, если сохранить квартальный контроль',
    lead: 'Денежный поток выдерживает текущую структуру целей; важно пересчитывать план при изменении дохода или обязательств.',
    keyInsight:
        'Свободный поток — 56 000 ₽ (28,0% дохода). Этого достаточно для планового движения без агрессивного ускорения. ИФУС семьи: 7,2 из 10 (Высокая устойчивость).',
    sustainabilityIndex: '7,2',
    legacySustainabilityIndex: '6,8',
    source: 'deterministic-template',
    cards: [
        { kind: 'risk', title: 'Контроль дисциплины', metric: '28,0%', body: 'дохода остаётся после обязательств и ПФП' },
        { kind: 'lever', title: 'Главный рычаг', metric: 'квартал', body: 'сверять факт пополнений и ИФУС' },
        { kind: 'effect', title: 'Главный эффект', metric: '42,0 млн', body: 'целевой капитал по базовому сценарию' },
    ],
    decisionRows: [
        { decision: 'Сохранить взносы', why: 'План держится на регулярности.', nextStep: 'Зафиксировать автоплатежи или календарь.' },
    ],
    recommendedScenario:
        'Базовый сценарий — сохранять текущий темп; раз в квартал проверять фактический поток и не увеличивать обязательства без пересчёта.',
    ifus: FINAM_REPORT_V2_SAMPLE_IFUS,
});

const FINAM_REPORT_V2_SAMPLE_PAYLOAD = Object.freeze({
    reportSchemaVersion: FINAM_REPORT_V2_SCHEMA_VERSION,
    client: {
        name: 'Иван Иванов',
        planningHorizon: '20+ лет',
        reportDate: '10 мая 2026',
    },
    advisor: {
        fullName: 'Анна Смирнова',
        email: 'advisor@finam.ru',
        phone: '+7 999 000-00-00',
    },
    executiveSummary: {
        headline: 'План устойчив, если сначала закрыть кассовый разрыв',
        lead:
            'У клиента есть капитал и понятные долгосрочные цели. Главный управленческий вопрос — дисциплина свободного денежного потока.',
        healthScore: '7,2',
        primaryRisk: 'Свободный поток после обязательств остаётся тонким.',
        recommendedScenario: 'Первые 90 дней — резерв и правила бюджета; затем пенсионная траектория.',
        actions: [
            'Зафиксировать финансовый резерв',
            'Приоритизировать долгосрочные цели',
            'Пересматривать сценарии раз в квартал',
        ],
    },
    portfolioSummary: {
        headline: 'Итоговый портфель: рост капитала без потери ликвидности',
        totalPortfolioValue: '12,9 млн ₽',
        horizon: '10 лет',
        monthlyContribution: '50 тыс ₽',
        expectedReturn: '11,0%',
        riskProfile: 'Сбалансированный',
        initialCapitalAllocation: [
            { assetClass: 'Облигации', percent: 30, value: '1,5 млн ₽' },
            { assetClass: 'Акции / фонды', percent: 26, value: '1,3 млн ₽' },
            { assetClass: 'Ликвидность', percent: 18, value: '0,9 млн ₽' },
            { assetClass: 'Защита', percent: 12, value: '0,6 млн ₽' },
            { assetClass: 'Альтернативы', percent: 14, value: '0,7 млн ₽' },
        ],
        monthlyContributionAllocation: [
            { assetClass: 'Акции / фонды', percent: 34, value: '17 тыс ₽/мес' },
            { assetClass: 'Облигации', percent: 24, value: '12 тыс ₽/мес' },
            { assetClass: 'Ликвидность', percent: 20, value: '10 тыс ₽/мес' },
            { assetClass: 'Защита', percent: 12, value: '6 тыс ₽/мес' },
            { assetClass: 'Альтернативы', percent: 10, value: '5 тыс ₽/мес' },
        ],
        allocation: [
            { assetClass: 'Облигации', percent: 30, value: '3,9 млн ₽', role: 'Стабильность и купонный поток' },
            { assetClass: 'Акции / фонды', percent: 26, value: '3,3 млн ₽', role: 'Рост капитала' },
            { assetClass: 'Ликвидность', percent: 18, value: '2,3 млн ₽', role: 'Резерв и возможность докупок' },
            { assetClass: 'Защита', percent: 12, value: '1,5 млн ₽', role: 'Снижение хвостовых рисков' },
            { assetClass: 'Альтернативы', percent: 14, value: '1,8 млн ₽', role: 'Диверсификация' },
        ],
        liquidityBuckets: [
            { name: 'Резерв', horizon: '0-6 месяцев', value: '1,8 млн ₽' },
            { name: 'Средний горизонт', horizon: '1-3 года', value: '3,4 млн ₽' },
            { name: 'Долгий капитал', horizon: '3+ года', value: '7,7 млн ₽' },
        ],
        principles: ['Сначала ликвидность', 'Доходность через дисциплину', 'Риск снижается к цели', 'Квартальный контроль'],
    },
    companies: [
        { id: 'finam', name: 'Финам', role: 'brokerAndAssetManager', note: 'Брокерский контур, ДУ и автоследование.' },
        { id: 'comon', name: 'Comon', role: 'autofollowPlatform', note: 'Витрина и механика автоследования.' },
        { id: 'bank-liquidity', name: 'Банковский контур', role: 'liquidityProvider', note: 'Депозит и накопительный счёт.' },
        { id: 'renessans-npf', name: 'НПФ Ренессанс', role: 'pensionProvider', note: 'ПДС и пенсионный контур.' },
    ],
    products: [
        {
            id: 'pds-renessans',
            name: 'ПДС НПФ Ренессанс',
            type: 'pds',
            companyId: 'renessans-npf',
            goalIds: ['pension'],
            exposure: 'пенсионный взнос и долгий капитал',
            allocationPercent: 10,
            horizon: '10+ лет',
            role: 'Пенсионная траектория, вычеты и софинансирование',
        },
        {
            id: 'deposits-savings',
            name: 'Депозит / накопительный счёт',
            type: 'liquidity',
            companyId: 'bank-liquidity',
            goalIds: ['finReserve', 'saveGrow'],
            exposure: 'ликвидная часть и короткий резерв',
            allocationPercent: 12,
            horizon: '0-12 месяцев',
            role: 'Низкий риск и доступность денег',
        },
        {
            id: 'finam-du',
            name: 'ДУ Финам',
            type: 'discretionaryManagement',
            companyId: 'finam',
            goalIds: ['saveGrow', 'passiveIncome'],
            exposure: 'управляемый инвестиционный слой',
            allocationPercent: 18,
            horizon: '3+ года',
            role: 'Профессиональное управление частью капитала',
        },
        {
            id: 'finam-comon',
            name: 'Автоследование Финам / Comon',
            type: 'autofollow',
            companyId: 'comon',
            goalIds: ['saveGrow'],
            exposure: 'доля брокерского портфеля',
            allocationPercent: 10,
            horizon: '1-3 года',
            role: 'Следование выбранной стратегии',
        },
        {
            id: 'bonds',
            name: 'Облигации',
            type: 'bonds',
            companyId: 'finam',
            goalIds: ['saveGrow', 'other', 'passiveIncome'],
            exposure: 'рублёвый облигационный контур',
            allocationPercent: 30,
            horizon: '1-5 лет',
            role: 'Купонный поток и снижение волатильности',
        },
        {
            id: 'equities',
            name: 'Акции / фонды акций',
            type: 'equities',
            companyId: 'finam',
            goalIds: ['saveGrow', 'passiveIncome'],
            exposure: 'доля роста без конкретных бумаг',
            allocationPercent: 20,
            horizon: '5+ лет',
            role: 'Рост капитала на длинном горизонте',
        },
    ],
    riskDeclaration: {
        headline: 'Информация для клиента по финансовому плану',
        overview:
            'Настоящая декларация подготовлена с целью объяснить ключевые риски, связанные с финансовым планом, инвестиционными решениями и страховыми продуктами.',
        importantNote:
            'Хранение капитала исключительно в денежной форме также несет риски, прежде всего риск инфляции и постепенного снижения покупательной способности денежных средств.',
        sections: [
            {
                id: 'inflation',
                title: '1. Инфляционный риск',
                essence: [
                    'Инфляция — это постепенное снижение покупательной способности денежных средств.',
                    'Даже при сохранении номинальной суммы капитала его реальная стоимость со временем уменьшается.',
                ],
                riskPoints: [
                    'накопления теряют покупательную способность',
                    'доходность консервативных инструментов может быть ниже инфляции',
                    'для будущих целей потребуется больший капитал',
                ],
                mitigations: [
                    'диверсификация инструментов',
                    'использование решений с доходностью выше инфляции',
                    'регулярный пересмотр плана и ребалансировка портфеля',
                ],
            },
            {
                id: 'market',
                title: '2. Рыночный риск',
                essence: [
                    'Стоимость инвестиционных активов зависит от экономики, ставок, действий регулятора, корпоративных событий и поведения участников рынка.',
                    'Инвестиционные продукты могут показывать временные или существенные просадки.',
                ],
                riskPoints: ['цены могут как расти, так и снижаться', 'прошлая доходность не гарантирует результаты в будущем'],
                mitigations: [
                    'диверсификация между инструментами',
                    'ограничение доли высокорисковых активов',
                    'долгосрочный горизонт инвестирования и контроль структуры портфеля',
                ],
            },
            {
                id: 'autofollow',
                title: '3. Риск повышенной волатильности и убытков по стратегиям автоследования',
                essence: [
                    'Стратегии автоследования могут использовать акции, фьючерсы, производные финансовые инструменты и активные торговые стратегии.',
                ],
                riskPoints: [
                    'высокая волатильность',
                    'резкие колебания стоимости',
                    'возможность временных и существенных убытков',
                    'доходность может отличаться от ожиданий клиента',
                ],
                mitigations: [
                    'ограничение доли капитала в агрессивных стратегиях',
                    'распределение активов по уровням риска',
                    'регулярный мониторинг стратегии',
                ],
            },
            {
                id: 'credit',
                title: '4. Кредитный и корпоративный риск',
                essence: [
                    'Эмитенты и контрагенты могут столкнуться с ухудшением финансового положения, дефолтом, изменением условий обслуживания и снижением надежности.',
                ],
                mitigations: [
                    'использование регулируемых организаций',
                    'распределение капитала между несколькими инструментами',
                    'ограничение концентрации в одном инструменте или компании',
                ],
            },
            {
                id: 'liquidity',
                title: '5. Риск ликвидности',
                essence: [
                    'Некоторые финансовые инструменты могут иметь ограниченную ликвидность, временно быть недоступны для продажи или реализовываться с дисконтом.',
                ],
                mitigations: [
                    'формирование резервного капитала',
                    'распределение средств между инструментами с разной ликвидностью',
                    'планирование инвестиционного горизонта',
                ],
            },
            {
                id: 'regulatory',
                title: '6. Регуляторный и налоговый риск',
                essence: [
                    'Законодательство, налоговые правила и регулирование финансового рынка могут изменяться и влиять на условия продуктов и итоговую доходность.',
                ],
                mitigations: [
                    'регулярный пересмотр финансового плана',
                    'адаптация структуры активов к изменениям законодательства',
                    'использование регулируемых инструментов и организаций',
                ],
            },
            {
                id: 'insurance',
                title: '7. Риски страховых продуктов',
                essence: [
                    'Программы страхования жизни и страховой защиты имеют условия действия, ограничения, исключения, сроки ожидания и установленный перечень страховых случаев.',
                    'Страховая выплата осуществляется исключительно в соответствии с условиями договора страхования.',
                ],
                riskPoints: [
                    'событие может не признаваться страховым случаем',
                    'выплата может быть ограничена при недостоверной информации',
                    'досрочное прекращение договора может привести к финансовым потерям',
                ],
                mitigations: [
                    'внимательное ознакомление с договором страхования',
                    'полное раскрытие информации при оформлении полиса',
                    'регулярный пересмотр страхового покрытия',
                ],
            },
            {
                id: 'stability',
                title: '8. Риск финансовой устойчивости финансовых организаций',
                essence: [
                    'Финансовые организации могут столкнуться с ограничением деятельности, отзывом лицензии, санацией или банкротством.',
                    'Риск относится к НПФ, брокерам, страховым организациям, управляющим компаниям и иным финансовым посредникам.',
                ],
                riskPoints: [
                    'временные ограничения доступа к активам',
                    'задержки операций и выплат',
                    'необходимость перевода активов к другому участнику рынка',
                ],
                mitigations: [
                    'диверсификация капитала между организациями и инструментами',
                    'ограничение концентрации средств в одной компании',
                    'регулярный пересмотр используемых продуктов',
                ],
            },
            {
                id: 'expectations',
                title: '9. Риск несоответствия ожиданий',
                essence: [
                    'Фактическая доходность инвестиций может отличаться от прогнозируемой или ожидаемой.',
                    'Финансовый план строится на предположениях, сценариях и расчетах, которые не гарантируют конкретный результат.',
                ],
                mitigations: [
                    'формирование реалистичных ожиданий',
                    'долгосрочный подход к инвестированию',
                    'контроль рисков и диверсификация',
                ],
            },
        ],
        conclusion: {
            title: 'Важное заключение',
            text: 'Финансовый план направлен не на полное исключение рисков, а на их разумное управление.',
            bullets: [
                'учитывает цели клиента',
                'помогает снижать влияние инфляции',
                'распределяет риски',
                'формирует долгосрочную финансовую устойчивость',
                'обеспечивает финансовую защиту семьи и капитала',
            ],
        },
        legalNotes: [
            'Материалы декларации носят информационный характер и не являются индивидуальной инвестиционной рекомендацией (ИИР).',
            'Прошлая доходность не гарантирует будущие результаты.',
            'Финансовые, пенсионные, брокерские и страховые условия, порядок гарантий, комиссии, ограничения и выплаты определяются действующим законодательством РФ, правилами провайдеров и документами конкретных продуктов.',
        ],
    },
    scenarios: [
        { name: 'Базовый', capital: '56,6 млн ₽', risk: 'Средний', progressPercent: 78 },
        { name: 'Стресс', capital: '46,4 млн ₽', risk: 'Высокий', progressPercent: 60 },
        { name: 'Ускорение', capital: '66,0 млн ₽', risk: 'Низкий', progressPercent: 92 },
    ],
    roadmap: [
        {
            horizon: 'Первые 90 дней',
            actions: ['Лимиты расходов', 'Контур резерва', 'Контроль свободного потока'],
        },
        {
            horizon: '12 месяцев',
            actions: ['Резерв по траектории', 'Проверка страховой защиты', 'Сверка пенсионного взноса'],
        },
        {
            horizon: '3 года',
            actions: ['Инвестиционный контур', 'Новые цели роста', 'Ежегодный пересчёт сценариев'],
        },
    ],
    partnerValue: {
        headline: 'Отчёт создаёт повод для следующей консультации',
        layers: [
            ['Диагностика', 'Индекс устойчивости и риски бюджета'],
            ['Сценарии', 'Стресс-тест и эффект дополнительных пополнений'],
            ['Продукты', 'Финрезерв, страхование, пенсионная траектория'],
            ['Сопровождение', 'Дорожная карта и регулярный пересчёт плана'],
        ],
    },
});

function validatePercentAllocation(errors, path, items, { requireRole = false } = {}) {
    if (!Array.isArray(items) || items.length < 1) {
        errors.push(`${path} must contain at least 1 item`);
        return;
    }

    let totalPercent = 0;
    items.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            errors.push(`${path}[${index}] must be an object`);
            return;
        }
        if (!item.assetClass) {
            errors.push(`${path}[${index}].assetClass is required`);
        }
        if (!item.value) {
            errors.push(`${path}[${index}].value is required`);
        }
        if (requireRole && !item.role) {
            errors.push(`${path}[${index}].role is required`);
        }

        const percent = Number(item.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
            errors.push(`${path}[${index}].percent must be > 0 and <= 100`);
            return;
        }
        totalPercent += percent;
    });

    if (items.length && Math.abs(totalPercent - 100) > 0.01) {
        errors.push(`${path} percent total must equal 100`);
    }
}

function validateNonEmptyStringArray(errors, path, items) {
    if (!Array.isArray(items) || items.length < 1) {
        errors.push(`${path} must contain at least 1 item`);
        return;
    }

    items.forEach((item, index) => {
        if (!item || typeof item !== 'string') {
            errors.push(`${path}[${index}] must be a non-empty string`);
        }
    });
}

function validateRiskDeclaration(errors, payload) {
    const riskDeclaration = payload.riskDeclaration;
    if (!riskDeclaration || typeof riskDeclaration !== 'object') {
        errors.push('riskDeclaration is required');
        return;
    }

    ['headline', 'overview', 'importantNote'].forEach((field) => {
        if (!riskDeclaration[field]) {
            errors.push(`riskDeclaration.${field} is required`);
        }
    });

    if (riskDeclaration.legalNotes != null) {
        validateNonEmptyStringArray(errors, 'riskDeclaration.legalNotes', riskDeclaration.legalNotes);
    }

    const sections = riskDeclaration.sections;
    if (!Array.isArray(sections) || sections.length < 1) {
        errors.push('riskDeclaration.sections must contain at least 1 item');
        return;
    }

    sections.forEach((section, index) => {
        if (!section || typeof section !== 'object') {
            errors.push(`riskDeclaration.sections[${index}] must be an object`);
            return;
        }
        ['id', 'title'].forEach((field) => {
            if (!section[field]) {
                errors.push(`riskDeclaration.sections[${index}].${field} is required`);
            }
        });
        validateNonEmptyStringArray(errors, `riskDeclaration.sections[${index}].essence`, section.essence);
        validateNonEmptyStringArray(errors, `riskDeclaration.sections[${index}].mitigations`, section.mitigations);
        if (section.riskPoints != null) {
            validateNonEmptyStringArray(errors, `riskDeclaration.sections[${index}].riskPoints`, section.riskPoints);
        }
    });

    const conclusion = riskDeclaration.conclusion;
    if (!conclusion || typeof conclusion !== 'object') {
        errors.push('riskDeclaration.conclusion is required');
        return;
    }

    ['title', 'text'].forEach((field) => {
        if (!conclusion[field]) {
            errors.push(`riskDeclaration.conclusion.${field} is required`);
        }
    });
    validateNonEmptyStringArray(errors, 'riskDeclaration.conclusion.bullets', conclusion.bullets);
}

function validateOptionalCompanyCatalog(errors, payload) {
    const companyIds = new Set();

    if (payload.companies != null) {
        if (!Array.isArray(payload.companies) || payload.companies.length < 1) {
            errors.push('companies must contain at least 1 item when provided');
        } else {
            payload.companies.forEach((company, index) => {
                if (!company || typeof company !== 'object') {
                    errors.push(`companies[${index}] must be an object`);
                    return;
                }
                ['id', 'name', 'role'].forEach((field) => {
                    if (!company[field]) {
                        errors.push(`companies[${index}].${field} is required`);
                    }
                });
                if (company.id) {
                    if (companyIds.has(company.id)) {
                        errors.push(`companies[${index}].id must be unique`);
                    }
                    companyIds.add(company.id);
                }
            });
        }
    }

    if (payload.products != null) {
        if (!Array.isArray(payload.products) || payload.products.length < 1) {
            errors.push('products must contain at least 1 item when provided');
        } else {
            payload.products.forEach((product, index) => {
                if (!product || typeof product !== 'object') {
                    errors.push(`products[${index}] must be an object`);
                    return;
                }
                ['id', 'name', 'type', 'companyId', 'role'].forEach((field) => {
                    if (!product[field]) {
                        errors.push(`products[${index}].${field} is required`);
                    }
                });
                if (product.companyId && payload.companies != null && !companyIds.has(product.companyId)) {
                    errors.push(`products[${index}].companyId references unknown company ${product.companyId}`);
                }
                if (!Array.isArray(product.goalIds)) {
                    errors.push(`products[${index}].goalIds must be an array`);
                }
                if (product.allocationPercent != null) {
                    const allocationPercent = Number(product.allocationPercent);
                    if (!Number.isFinite(allocationPercent) || allocationPercent < 0 || allocationPercent > 100) {
                        errors.push(`products[${index}].allocationPercent must be 0..100`);
                    }
                }
            });
        }
    }
}

function validateFinamReportV2Payload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return ['payload must be an object'];
    }

    if (payload.reportSchemaVersion !== FINAM_REPORT_V2_SCHEMA_VERSION) {
        errors.push(`reportSchemaVersion must be ${FINAM_REPORT_V2_SCHEMA_VERSION}`);
    }

    if (!payload.client || typeof payload.client !== 'object') {
        errors.push('client is required');
    }

    if (!payload.advisor || typeof payload.advisor !== 'object') {
        errors.push('advisor is required');
    } else {
        ['fullName', 'email', 'phone'].forEach((field) => {
            if (!payload.advisor[field]) {
                errors.push(`advisor.${field} is required`);
            }
        });
    }

    if (!payload.executiveSummary || typeof payload.executiveSummary !== 'object') {
        errors.push('executiveSummary is required');
    } else {
        ['headline', 'lead', 'healthScore', 'primaryRisk', 'recommendedScenario'].forEach((field) => {
            if (!payload.executiveSummary[field]) {
                errors.push(`executiveSummary.${field} is required`);
            }
        });
        if (!Array.isArray(payload.executiveSummary.actions)) {
            errors.push('executiveSummary.actions must be an array');
        }
    }

    if (!payload.portfolioSummary || typeof payload.portfolioSummary !== 'object') {
        errors.push('portfolioSummary is required');
    } else {
        ['headline', 'totalPortfolioValue', 'horizon', 'monthlyContribution', 'expectedReturn', 'riskProfile'].forEach((field) => {
            if (!payload.portfolioSummary[field]) {
                errors.push(`portfolioSummary.${field} is required`);
            }
        });
        validatePercentAllocation(errors, 'portfolioSummary.allocation', payload.portfolioSummary.allocation, { requireRole: true });
        validatePercentAllocation(errors, 'portfolioSummary.initialCapitalAllocation', payload.portfolioSummary.initialCapitalAllocation);
        validatePercentAllocation(errors, 'portfolioSummary.monthlyContributionAllocation', payload.portfolioSummary.monthlyContributionAllocation);
        if (!Array.isArray(payload.portfolioSummary.liquidityBuckets)) {
            errors.push('portfolioSummary.liquidityBuckets must be an array');
        }
        if (!Array.isArray(payload.portfolioSummary.principles)) {
            errors.push('portfolioSummary.principles must be an array');
        }
    }

    validateOptionalCompanyCatalog(errors, payload);
    validateRiskDeclaration(errors, payload);

    if (payload.scenarios != null) {
        if (!Array.isArray(payload.scenarios)) {
            errors.push('scenarios must be an array');
        } else {
            payload.scenarios.forEach((scenario, index) => {
                if (!scenario || typeof scenario !== 'object') {
                    errors.push(`scenarios[${index}] must be an object`);
                    return;
                }
                ['name', 'capital', 'risk'].forEach((field) => {
                    if (!scenario[field]) {
                        errors.push(`scenarios[${index}].${field} is required`);
                    }
                });
                if (scenario.progressPercent != null) {
                    const percent = Number(scenario.progressPercent);
                    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
                        errors.push(`scenarios[${index}].progressPercent must be 0..100`);
                    }
                }
            });
        }
    }

    if (!Array.isArray(payload.roadmap) || payload.roadmap.length < 3) {
        errors.push('roadmap must contain at least 3 horizons');
    } else {
        payload.roadmap.forEach((step, index) => {
            if (!step || typeof step !== 'object') {
                errors.push(`roadmap[${index}] must be an object`);
                return;
            }
            if (!step.horizon) {
                errors.push(`roadmap[${index}].horizon is required`);
            }
            if (!Array.isArray(step.actions)) {
                errors.push(`roadmap[${index}].actions must be an array`);
            }
        });
    }

    if (!payload.partnerValue || typeof payload.partnerValue !== 'object') {
        errors.push('partnerValue is required');
    } else {
        if (!payload.partnerValue.headline) {
            errors.push('partnerValue.headline is required');
        }
        if (!Array.isArray(payload.partnerValue.layers)) {
            errors.push('partnerValue.layers must be an array');
        } else {
            payload.partnerValue.layers.forEach((layer, index) => {
                if (!Array.isArray(layer) || layer.length < 2) {
                    errors.push(`partnerValue.layers[${index}] must be [name, value]`);
                }
            });
        }
    }

    return errors;
}

module.exports = {
    FINAM_REPORT_V2_SCHEMA_VERSION,
    FINAM_REPORT_V2_PAGE_TYPES,
    FINAM_REPORT_V2_DEFAULT_ORDER,
    FINAM_REPORT_V2_DYNAMIC_PAGE_TYPES,
    FINAM_REPORT_V2_TYPOGRAPHY_LIMITS,
    FINAM_REPORT_V2_SAMPLE_IFUS,
    FINAM_REPORT_V2_SAMPLE_EXECUTIVE_DECISION,
    FINAM_REPORT_V2_SAMPLE_PAYLOAD,
    validateFinamReportV2Payload,
};
