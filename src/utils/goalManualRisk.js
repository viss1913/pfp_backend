'use strict';

/**
 * Тело PATCH пересчёта цели явно задаёт ручной риск (не методика анкеты).
 * Ожидаемые поля в корне тела: risk_profile и/или risk_profile_extended.
 */
function patchHasExplicitManualGoalRisk(patch) {
    if (!patch || typeof patch !== 'object') return false;
    return (
        Object.prototype.hasOwnProperty.call(patch, 'risk_profile') ||
        Object.prototype.hasOwnProperty.call(patch, 'risk_profile_extended')
    );
}

/**
 * Сбрасываем снимок методики и «лишний» extended, чтобы findPortfolioRiskProfileRow
 * опирался только на ручные поля цели.
 */
function applyManualGoalRiskSanitize(goal, patch) {
    if (!goal || !patchHasExplicitManualGoalRisk(patch)) return;
    goal.risk_profile_details = null;
    if (!Object.prototype.hasOwnProperty.call(patch, 'risk_profile_extended')) {
        goal.risk_profile_extended = null;
    }
}

module.exports = {
    patchHasExplicitManualGoalRisk,
    applyManualGoalRiskSanitize,
};
