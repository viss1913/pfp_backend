/**
 * Проекты с расчётом LIFE «Подушка безопасности · Сбер» (тариф 1,44%/год).
 * Immers test Finam = 2; ATB white-label = 3/28 (PDF — СК Лучи), prod Finam = 14, Sber = 29.
 * Оверрайд: SBER_LIFE_CALC_PROJECT_IDS=2,3,14,28,29
 */
const DEFAULT_SBER_LIFE_CALC_PROJECT_IDS = [2, 3, 14, 28, 29];

function parseSberLifeCalcProjectIds() {
    const raw = process.env.SBER_LIFE_CALC_PROJECT_IDS;
    if (raw == null || String(raw).trim() === '') {
        return new Set(DEFAULT_SBER_LIFE_CALC_PROJECT_IDS);
    }
    const ids = String(raw)
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? new Set(ids) : new Set(DEFAULT_SBER_LIFE_CALC_PROJECT_IDS);
}

function isSberLifeCalcProject(projectId) {
    const pid = projectId == null ? NaN : Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    return parseSberLifeCalcProjectIds().has(pid);
}

module.exports = {
    DEFAULT_SBER_LIFE_CALC_PROJECT_IDS,
    parseSberLifeCalcProjectIds,
    isSberLifeCalcProject,
};
