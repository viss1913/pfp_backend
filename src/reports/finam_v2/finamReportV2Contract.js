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
    FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER,
    FINAM_REPORT_V2_PAGE_TYPES.PORTFOLIO_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.TAX_PLANNING,
    FINAM_REPORT_V2_PAGE_TYPES.COMON_AUTOFOLLOW,
    FINAM_REPORT_V2_PAGE_TYPES.IDU_STRATEGIES,
    FINAM_REPORT_V2_PAGE_TYPES.FINAM_OFFERS,
    FINAM_REPORT_V2_PAGE_TYPES.INFLATION,
    FINAM_REPORT_V2_PAGE_TYPES.SCENARIOS,
    FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
    FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN,
    FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
    FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
]);

const FINAM_REPORT_V2_DYNAMIC_PAGE_TYPES = Object.freeze([
    FINAM_REPORT_V2_PAGE_TYPES.EXECUTIVE_SUMMARY,
    FINAM_REPORT_V2_PAGE_TYPES.SCENARIOS,
    FINAM_REPORT_V2_PAGE_TYPES.ROADMAP,
    FINAM_REPORT_V2_PAGE_TYPES.RISK_DECLARATION,
    FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE,
]);

const FINAM_REPORT_V2_RISK_LEVELS = Object.freeze(['low', 'lowMedium', 'medium', 'mediumHigh', 'high']);

const FINAM_REPORT_V2_TYPOGRAPHY_LIMITS = Object.freeze({
    bodyMinPx: 9,
    captionMinPx: 8,
    footerTargetPx: 8,
    chartAxisMinPx: 8,
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
        riskProfile: 'Умеренный',
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
        headline: 'Риски плана управляемы, если контролировать продуктовую концентрацию',
        summaryRiskLevel: 'medium',
        reviewCadence: 'квартально',
        topRisks: ['Просадка рынка', 'Процентная ставка', 'Условия ПДС', 'Поведенческий риск клиента'],
        legalNotes: [
            'Материалы декларации носят информационный характер и не являются индивидуальной инвестиционной рекомендацией.',
            'Прошлая доходность не гарантирует будущие результаты.',
        ],
        riskRegister: [
            {
                id: 'market-drawdown',
                title: 'Просадка рынка',
                category: 'market',
                productIds: ['finam-du', 'finam-comon', 'equities'],
                companyIds: ['finam', 'comon'],
                probability: 'mediumHigh',
                impact: 'high',
                residualRisk: 'mediumHigh',
                exposure: 'инвестиционная часть портфеля',
                controls: ['лимиты долей', 'горизонт по целям', 'ребалансировка'],
                reviewTriggers: ['просадка выше лимита', 'изменение риск-профиля'],
                clientMessage: 'Рыночная просадка ожидаема; решение принимаем по правилам, а не по эмоциям.',
            },
            {
                id: 'rate-duration',
                title: 'Процентный риск облигаций',
                category: 'market',
                productIds: ['bonds'],
                companyIds: ['finam'],
                probability: 'medium',
                impact: 'medium',
                residualRisk: 'medium',
                exposure: 'облигационная часть без конкретных выпусков',
                controls: ['контроль дюрации', 'лестница сроков', 'пересмотр при изменении ключевой ставки'],
                reviewTriggers: ['смена макросценария', 'рост инфляции выше прогноза'],
                clientMessage: 'Облигации снижают волатильность, но не являются депозитом.',
            },
            {
                id: 'product-terms',
                title: 'Условия ПДС',
                category: 'product',
                productIds: ['pds-renessans'],
                companyIds: ['renessans-npf'],
                probability: 'lowMedium',
                impact: 'medium',
                residualRisk: 'medium',
                exposure: 'пенсионный контур',
                controls: ['проверка правил ПДС', 'мониторинг правил программы', 'платёжная дисциплина'],
                reviewTriggers: ['изменение правил продукта', 'изменение налоговых условий'],
                clientMessage: 'Налоговые льготы и софинансирование работают только при соблюдении условий ПДС.',
            },
            {
                id: 'liquidity-return',
                title: 'Низкая реальная доходность ликвидности',
                category: 'product',
                productIds: ['deposits-savings'],
                companyIds: ['bank-liquidity'],
                probability: 'medium',
                impact: 'medium',
                residualRisk: 'lowMedium',
                exposure: 'депозит и накопительный счёт',
                controls: ['сверка ставки с инфляцией', 'разделение резерва и долгого капитала', 'пересмотр при снижении ставок'],
                reviewTriggers: ['ставка ниже инфляции', 'рост доли ликвидности выше лимита'],
                clientMessage: 'Депозит и накопительный счёт нужны для доступности денег, но не должны заменять долгий инвестиционный контур.',
            },
            {
                id: 'behavioral-risk',
                title: 'Поведенческий риск клиента',
                category: 'behavioral',
                productIds: ['finam-du', 'finam-comon', 'bonds', 'equities', 'pds-renessans', 'deposits-savings'],
                companyIds: ['finam', 'comon', 'renessans-npf', 'bank-liquidity'],
                probability: 'medium',
                impact: 'high',
                residualRisk: 'medium',
                exposure: 'весь финансовый план',
                controls: ['дорожная карта', 'квартальная сверка', 'стресс- и оптимистичный сценарии'],
                reviewTriggers: ['остановка пополнений', 'выход на просадке', 'крупный незапланированный расход'],
                clientMessage: 'Главный риск плана часто не рынок, а нарушение дисциплины пополнений.',
            },
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

function validateIdArray(errors, path, ids, allowedIds) {
    if (!Array.isArray(ids) || ids.length < 1) {
        errors.push(`${path} must contain at least 1 id`);
        return;
    }

    ids.forEach((id, index) => {
        if (!id || typeof id !== 'string') {
            errors.push(`${path}[${index}] must be a string`);
            return;
        }
        if (allowedIds && !allowedIds.has(id)) {
            errors.push(`${path}[${index}] references unknown id ${id}`);
        }
    });
}

function validateRiskLevel(errors, path, value) {
    if (!FINAM_REPORT_V2_RISK_LEVELS.includes(value)) {
        errors.push(`${path} must be one of ${FINAM_REPORT_V2_RISK_LEVELS.join(', ')}`);
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

function validateCompaniesAndProducts(errors, payload) {
    const companyIds = new Set();
    const productIds = new Set();

    if (!Array.isArray(payload.companies) || payload.companies.length < 1) {
        errors.push('companies must contain at least 1 item');
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

    if (!Array.isArray(payload.products) || payload.products.length < 1) {
        errors.push('products must contain at least 1 item');
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
            if (product.id) {
                if (productIds.has(product.id)) {
                    errors.push(`products[${index}].id must be unique`);
                }
                productIds.add(product.id);
            }
            if (product.companyId && !companyIds.has(product.companyId)) {
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

    return { companyIds, productIds };
}

function validateRiskDeclaration(errors, payload, { companyIds, productIds }) {
    const riskDeclaration = payload.riskDeclaration;
    if (!riskDeclaration || typeof riskDeclaration !== 'object') {
        errors.push('riskDeclaration is required');
        return;
    }

    ['headline', 'summaryRiskLevel', 'reviewCadence'].forEach((field) => {
        if (!riskDeclaration[field]) {
            errors.push(`riskDeclaration.${field} is required`);
        }
    });
    if (riskDeclaration.summaryRiskLevel) {
        validateRiskLevel(errors, 'riskDeclaration.summaryRiskLevel', riskDeclaration.summaryRiskLevel);
    }
    validateNonEmptyStringArray(errors, 'riskDeclaration.topRisks', riskDeclaration.topRisks);
    validateNonEmptyStringArray(errors, 'riskDeclaration.legalNotes', riskDeclaration.legalNotes);

    const riskRegister = riskDeclaration.riskRegister;
    if (!Array.isArray(riskRegister) || riskRegister.length < 1) {
        errors.push('riskDeclaration.riskRegister must contain at least 1 item');
        return;
    }

    riskRegister.forEach((risk, index) => {
        if (!risk || typeof risk !== 'object') {
            errors.push(`riskDeclaration.riskRegister[${index}] must be an object`);
            return;
        }
        ['id', 'title', 'category', 'probability', 'impact', 'residualRisk', 'exposure', 'clientMessage'].forEach((field) => {
            if (!risk[field]) {
                errors.push(`riskDeclaration.riskRegister[${index}].${field} is required`);
            }
        });
        ['probability', 'impact', 'residualRisk'].forEach((field) => {
            if (risk[field]) {
                validateRiskLevel(errors, `riskDeclaration.riskRegister[${index}].${field}`, risk[field]);
            }
        });
        validateIdArray(errors, `riskDeclaration.riskRegister[${index}].productIds`, risk.productIds, productIds);
        validateIdArray(errors, `riskDeclaration.riskRegister[${index}].companyIds`, risk.companyIds, companyIds);
        validateNonEmptyStringArray(errors, `riskDeclaration.riskRegister[${index}].controls`, risk.controls);
        validateNonEmptyStringArray(errors, `riskDeclaration.riskRegister[${index}].reviewTriggers`, risk.reviewTriggers);
    });

    productIds.forEach((productId) => {
        const isCovered = riskRegister.some((risk) => Array.isArray(risk.productIds) && risk.productIds.includes(productId));
        if (!isCovered) {
            errors.push(`riskDeclaration.riskRegister must cover product ${productId}`);
        }
    });
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

    const catalog = validateCompaniesAndProducts(errors, payload);
    validateRiskDeclaration(errors, payload, catalog);

    if (!Array.isArray(payload.scenarios) || payload.scenarios.length < 3) {
        errors.push('scenarios must contain at least 3 items');
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
    FINAM_REPORT_V2_SAMPLE_PAYLOAD,
    validateFinamReportV2Payload,
};
