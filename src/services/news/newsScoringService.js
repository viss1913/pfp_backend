/**
 * Keyword scoring, event type detection, agent takeaway templates.
 */

const { EVENT_TYPES } = require('./newsConfig');

/** @type {{ pattern: RegExp; eventType: string; weight: number; tag?: string }[]} */
const HIGH_PRIORITY = [
    { pattern: /ключев\w*\s+ставк|ставк\w*\s+цб|банк\s+росси/i, eventType: 'RATE_CHANGE', weight: 50, tag: 'ставка' },
    { pattern: /\bцб\b|банк\s+росси/i, eventType: 'RATE_CHANGE', weight: 35, tag: 'цб' },
    { pattern: /инфляц/i, eventType: 'INFLATION', weight: 45, tag: 'инфляция' },
    { pattern: /санкц/i, eventType: 'SANCTIONS', weight: 45, tag: 'санкции' },
    { pattern: /\bнефт|\bопек\b|brent|urals/i, eventType: 'OIL', weight: 40, tag: 'нефть' },
    { pattern: /ипотек/i, eventType: 'BANKING', weight: 40, tag: 'ипотека' },
    { pattern: /налог|ндфл|иис|вычет/i, eventType: 'TAX_CHANGE', weight: 40, tag: 'налоги' },
    { pattern: /девальвац|обесценен/i, eventType: 'CURRENCY', weight: 40, tag: 'валюта' },
    { pattern: /usd\s*\/\s*rub|доллар|курс\s+руб|рубл\w*\s+к\s+долл/i, eventType: 'CURRENCY', weight: 38, tag: 'курс' },
    { pattern: /минфин/i, eventType: 'TAX_CHANGE', weight: 35, tag: 'минфин' },
];

/** @type {{ pattern: RegExp; eventType: string; weight: number; tag?: string }[]} */
const MEDIUM_PRIORITY = [
    { pattern: /\bсбер\b/i, eventType: 'BANKING', weight: 22, tag: 'сбер' },
    { pattern: /\bвтб\b/i, eventType: 'BANKING', weight: 22, tag: 'втб' },
    { pattern: /мосбирж|moex|imoex/i, eventType: 'STOCK_MARKET', weight: 25, tag: 'рынок' },
    { pattern: /дивиденд/i, eventType: 'STOCK_MARKET', weight: 20, tag: 'дивиденды' },
    { pattern: /облигац|офз/i, eventType: 'STOCK_MARKET', weight: 22, tag: 'облигации' },
    { pattern: /банк\w*|кредит/i, eventType: 'BANKING', weight: 18, tag: 'банки' },
    { pattern: /фондов\w*\s+рынок|акци/i, eventType: 'STOCK_MARKET', weight: 20, tag: 'акции' },
];

/** Negative — reject unless economic context also matches */
const NEGATIVE_KEYWORDS = [
    /футбол|хоккей|чемпионат\s+мира|олимпиад/i,
    /сериал|кино|фильм|шоу-бизнес|звезд\w*\s+развод/i,
    /дтп|убийств|пожар(?!.*(?:нефт|газ))/i,
    /мода|красот|рецепт|кулинар/i,
    /гороскоп/i,
];

const ECONOMIC_CONTEXT = /экономик|финанс|банк|ставк|инфляц|рубл|курс|налог|бирж|инвест/i;

const AGENT_TAKEAWAY = {
    RATE_CHANGE:
        'На звонках с вкладами и ипотекой — опереться на решение ЦБ; актуальную ставку смотри в блоке «Показатели».',
    INFLATION:
        'Уместно обсудить покупательную способность и реальную доходность накоплений; цифры ИПЦ — в «Показателях».',
    SANCTIONS:
        'Кратко объясни клиенту контекст ограничений без паники; акцент на диверсификацию и горизонт плана.',
    TAX_CHANGE:
        'Проверь, затрагивает ли новость ИИС, вычеты или налогообложение дохода — предложи пересмотр целей при необходимости.',
    OIL:
        'Для клиентов с валютными целями — связь нефти и рубля; без прогнозов «куда пойдёт».',
    BANKING:
        'Актуально для ипотеки, вкладов и кредитной нагрузки — свяжи с целями клиента в плане.',
    STOCK_MARKET:
        'Для инвестиционных целей — напомни про риск-профиль и горизонт; не подменяй индивидуальную рекомендацию.',
    CURRENCY:
        'Валютные цели и поездки — обсуди влияние курса на пополнение и срок; курс — в «Показателях».',
    OTHER:
        'Используй как повод для разговора о макроконтексте; цифры бери из блока «Показатели».',
};

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasNegativeWithoutEconomicContext(text) {
    const t = String(text || '');
    const hasNegative = NEGATIVE_KEYWORDS.some((re) => re.test(t));
    if (!hasNegative) return false;
    return !ECONOMIC_CONTEXT.test(t);
}

/**
 * @param {string} title
 * @param {string} [description]
 * @returns {{ eventType: string; keywordWeight: number; tags: string[]; matchedHigh: boolean }}
 */
function scoreKeywords(title, description = '') {
    const text = `${title} ${description}`.trim();
    let keywordWeight = 0;
    let eventType = 'OTHER';
    let matchedHigh = false;
    const tags = new Set();

    for (const rule of HIGH_PRIORITY) {
        if (rule.pattern.test(text)) {
            keywordWeight = Math.max(keywordWeight, rule.weight);
            eventType = rule.eventType;
            matchedHigh = true;
            if (rule.tag) tags.add(rule.tag);
        }
    }

    for (const rule of MEDIUM_PRIORITY) {
        if (rule.pattern.test(text)) {
            if (!matchedHigh) {
                keywordWeight = Math.max(keywordWeight, rule.weight);
                if (eventType === 'OTHER') eventType = rule.eventType;
            } else {
                keywordWeight = Math.min(50, keywordWeight + Math.floor(rule.weight / 3));
            }
            if (rule.tag) tags.add(rule.tag);
        }
    }

    return { eventType, keywordWeight, tags: [...tags], matchedHigh };
}

/**
 * @param {number} trustWeight 0–100
 * @returns {number} 0–30
 */
function sourceWeight(trustWeight) {
    return Math.min(30, Math.round((Number(trustWeight) || 50) * 0.3));
}

/**
 * @param {Date} publishedAt
 * @param {Date} [now]
 * @returns {number} 0–20
 */
function recencyWeight(publishedAt, now = new Date()) {
    const pub = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
    const hours = Math.max(0, (now.getTime() - pub.getTime()) / (3600 * 1000));
    return Math.max(0, 20 - Math.floor(hours / 6));
}

/**
 * @param {{ title: string; description?: string; trustWeight: number; publishedAt: Date }}
 * @returns {{ score: number; eventType: string; tags: string[]; agentTakeaway: string; rejectReason?: string }}
 */
function scoreArticle({ title, description, trustWeight, publishedAt }) {
    const text = `${title} ${description || ''}`;

    if (hasNegativeWithoutEconomicContext(text)) {
        return {
            score: 0,
            eventType: 'OTHER',
            tags: [],
            agentTakeaway: AGENT_TAKEAWAY.OTHER,
            rejectReason: 'negative_keyword',
        };
    }

    const { eventType, keywordWeight, tags, matchedHigh } = scoreKeywords(title, description);

    const hasMediumOnly = keywordWeight > 0 && !matchedHigh;
    if (keywordWeight === 0 && eventType === 'OTHER') {
        return {
            score: 0,
            eventType: 'OTHER',
            tags: [],
            agentTakeaway: AGENT_TAKEAWAY.OTHER,
            rejectReason: 'no_relevant_keywords',
        };
    }

    const sw = sourceWeight(trustWeight);
    const rw = recencyWeight(publishedAt);
    const score = keywordWeight + sw + rw;

  // Medium-only needs slightly higher bar at ingest
    if (hasMediumOnly && keywordWeight < 18) {
        return {
            score,
            eventType,
            tags,
            agentTakeaway: AGENT_TAKEAWAY[eventType] || AGENT_TAKEAWAY.OTHER,
            rejectReason: 'weak_medium_match',
        };
    }

    return {
        score,
        eventType,
        tags,
        agentTakeaway: AGENT_TAKEAWAY[eventType] || AGENT_TAKEAWAY.OTHER,
    };
}

module.exports = {
    EVENT_TYPES,
    scoreArticle,
    scoreKeywords,
    sourceWeight,
    recencyWeight,
    hasNegativeWithoutEconomicContext,
    AGENT_TAKEAWAY,
};
