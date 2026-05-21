/** Finam (14): срок защиты жизни на first-run / расчёт — 5 лет. Sber/АТБ white-label — 15 лет. */
const FINAM_PROJECT_ID = 14;
const FINAM_LIFE_TERM_MONTHS = 5 * 12;

const SBER_PROJECT_ID = 29;
const ATB_PROJECT_ID = 28;
const SBER_LIFE_TERM_MONTHS = 15 * 12;

const FIXED_LIFE_TERM_BY_PROJECT = new Map([
    [FINAM_PROJECT_ID, FINAM_LIFE_TERM_MONTHS],
    [SBER_PROJECT_ID, SBER_LIFE_TERM_MONTHS],
    [ATB_PROJECT_ID, SBER_LIFE_TERM_MONTHS],
]);

/**
 * @param {number|string|null|undefined} projectId
 * @returns {number|null} фиксированный term_months для LIFE или null (брать из цели)
 */
function fixedLifeTermMonthsForProject(projectId) {
    const pid = Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return FIXED_LIFE_TERM_BY_PROJECT.get(pid) ?? null;
}

/**
 * @param {number|string|null|undefined} projectId
 * @returns {number|null}
 */
function fixedLifeTermYearsForProject(projectId) {
    const months = fixedLifeTermMonthsForProject(projectId);
    return months != null ? Math.ceil(months / 12) : null;
}

module.exports = {
    FINAM_PROJECT_ID,
    FINAM_LIFE_TERM_MONTHS,
    SBER_PROJECT_ID,
    SBER_LIFE_TERM_MONTHS,
    fixedLifeTermMonthsForProject,
    fixedLifeTermYearsForProject,
};
