/** Finam (14): срок защиты жизни на first-run / расчёт — 5 лет. Sber/АТБ white-label — 15 лет. */
const FINAM_PROJECT_ID = 14;
const FINAM_LIFE_TERM_MONTHS = 5 * 12;

const ATB_BANK_PROJECT_ID = 3;
const SBER_PROJECT_ID = 29;
const ATB_LEGACY_PROJECT_ID = 28;
const SBER_LIFE_TERM_MONTHS = 15 * 12;

/** Immers / test Finam tenant — дефолт 6 лет (как в Podushka final.py) */
const IMMERS_TEST_FINAM_PROJECT_ID = 2;
const IMMERS_TEST_FINAM_LIFE_TERM_MONTHS = 6 * 12;

const DEFAULT_LIFE_TERM_BY_PROJECT = new Map([
    [FINAM_PROJECT_ID, FINAM_LIFE_TERM_MONTHS],
    [IMMERS_TEST_FINAM_PROJECT_ID, IMMERS_TEST_FINAM_LIFE_TERM_MONTHS],
    [SBER_PROJECT_ID, SBER_LIFE_TERM_MONTHS],
    [ATB_BANK_PROJECT_ID, SBER_LIFE_TERM_MONTHS],
    [ATB_LEGACY_PROJECT_ID, SBER_LIFE_TERM_MONTHS],
]);

/** @deprecated use resolveLifeTermMonths — оставлено для обратной совместимости */
const FIXED_LIFE_TERM_BY_PROJECT = DEFAULT_LIFE_TERM_BY_PROJECT;

/**
 * @param {number|string|null|undefined} projectId
 * @returns {number|null} фиксированный term_months для LIFE или null (брать из цели)
 */
function fixedLifeTermMonthsForProject(projectId) {
    const pid = Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return DEFAULT_LIFE_TERM_BY_PROJECT.get(pid) ?? null;
}

/**
 * Срок LIFE: приоритет у goal.term_months; иначе дефолт по projectId; иначе 120.
 * @param {number|string|null|undefined} projectId
 * @param {number|string|null|undefined} goalTermMonths
 * @returns {number}
 */
function resolveLifeTermMonths(projectId, goalTermMonths) {
    const fromGoal = Number(goalTermMonths);
    if (Number.isFinite(fromGoal) && fromGoal > 0) {
        return Math.round(fromGoal);
    }
    const def = fixedLifeTermMonthsForProject(projectId);
    if (def != null) return def;
    return 120;
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
    ATB_BANK_PROJECT_ID,
    ATB_LEGACY_PROJECT_ID,
    FINAM_PROJECT_ID,
    IMMERS_TEST_FINAM_PROJECT_ID,
    IMMERS_TEST_FINAM_LIFE_TERM_MONTHS,
    FINAM_LIFE_TERM_MONTHS,
    SBER_PROJECT_ID,
    SBER_LIFE_TERM_MONTHS,
    fixedLifeTermMonthsForProject,
    fixedLifeTermYearsForProject,
    resolveLifeTermMonths,
};
