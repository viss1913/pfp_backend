/**
 * Канонические display-имена LIFE «Страхование по подписке» (Сбер / АТБ).
 */

const SBER_LIFE_PROGRAM_LABEL = 'Страхование по подписке. Сбер Страхование Жизни';
const SBER_LIFE_PROGRAM_SHORT = 'Страхование по подписке';
const ATB_LIFE_PROGRAM_LABEL = 'Страхование по подписке. СК Лучи';

/**
 * Переименовать устаревшие «Подушка…» / старый разделитель · в канон.
 * @param {unknown} name
 * @param {{ atb?: boolean }} [opts]
 * @returns {string}
 */
function normalizeSberLifeProgramLabel(name, opts = {}) {
    const raw = String(name || '').trim();
    const canon = opts.atb ? ATB_LIFE_PROGRAM_LABEL : SBER_LIFE_PROGRAM_LABEL;
    if (!raw) return canon;

    const lower = raw.toLowerCase();
    const isLegacyPodushka = /подушка\s+безопасности/.test(lower);
    const isSubscription = /страхование\s+по\s+подписке/.test(lower);
    const isSberBranded = /сбер/.test(lower) || /ск\s*лучи/.test(lower);

    if (isLegacyPodushka || (isSubscription && (isSberBranded || opts.atb))) {
        return canon;
    }
    if (isSubscription && !isSberBranded && !opts.atb) {
        // короткое имя без страховщика → полное
        return SBER_LIFE_PROGRAM_LABEL;
    }
    return raw;
}

module.exports = {
    SBER_LIFE_PROGRAM_LABEL,
    SBER_LIFE_PROGRAM_SHORT,
    ATB_LIFE_PROGRAM_LABEL,
    normalizeSberLifeProgramLabel,
};
