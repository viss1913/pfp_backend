const clientService = require('./clientService');

/**
 * Проставляет в объекте расчёта реальные goal_id из БД (по имени и goal_type_id).
 * Мутирует calculation.goals.
 */
async function syncCalculationGoalsWithDatabase(clientId, calculation) {
    if (!calculation || !calculation.goals) return;

    const dbGoals = await clientService.getFullClient(clientId);
    if (!dbGoals || !dbGoals.goals) return;

    calculation.goals.forEach((calcGoal) => {
        const match = dbGoals.goals.find(
            (dg) =>
                String(dg.name).trim() === String(calcGoal.goal_name || calcGoal.name).trim() &&
                Number(dg.goal_type_id) === Number(calcGoal.goal_type_id)
        );

        if (match) {
            calcGoal.goal_id = match.id;
            calcGoal.id = match.id;
        }
    });
}

module.exports = {
    syncCalculationGoalsWithDatabase,
};
