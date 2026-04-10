/**
 * Достаёт массив целей из сохранённого goals_summary (плоский снимок calculateFirstRun или обёртка calculation).
 */
function extractSnapshotGoals(stored) {
    if (!stored || typeof stored !== 'object') return null;
    if (Array.isArray(stored.goals) && stored.summary) {
        return stored.goals;
    }
    const calc = stored.calculation;
    if (calc && Array.isArray(calc.goals)) {
        return calc.goals;
    }
    return null;
}

/**
 * Вливает summary/details (в т.ч. monthly_schedule) из снимка в элементы goals[] из БД по goal_id === id.
 * Не затирает колонки БД; только добавляет расчётные поля как в ответе first-run.
 */
function mergeGoalsWithSnapshot(clientObj) {
    if (!clientObj || !Array.isArray(clientObj.goals) || clientObj.goals.length === 0) {
        return clientObj;
    }

    const gs = clientObj.goals_summary;
    if (!gs || typeof gs !== 'object') {
        return clientObj;
    }

    const snapshotGoals = extractSnapshotGoals(gs);
    if (!snapshotGoals || snapshotGoals.length === 0) {
        return clientObj;
    }

    const byGoalId = new Map();
    for (const sg of snapshotGoals) {
        const gid = sg.goal_id != null ? Number(sg.goal_id) : null;
        if (gid != null && !Number.isNaN(gid)) {
            byGoalId.set(gid, sg);
        }
    }

    if (byGoalId.size === 0) {
        return clientObj;
    }

    clientObj.goals = clientObj.goals.map((dbGoal) => {
        const rowId = dbGoal.id != null ? Number(dbGoal.id) : null;
        if (rowId == null || Number.isNaN(rowId)) {
            return dbGoal;
        }
        let snap = byGoalId.get(rowId);
        // Старые снимки: goal_id ошибочно совпадал с goal_type_id → слияние по имени и типу
        if (!snap && snapshotGoals.length > 0) {
            const dbName = String(dbGoal.name || '').trim();
            const dbType = Number(dbGoal.goal_type_id);
            snap = snapshotGoals.find((sg) => {
                const sgName = String(sg.goal_name || sg.name || '').trim();
                const sgType = Number(sg.goal_type_id);
                if (!dbName || Number.isNaN(dbType) || Number.isNaN(sgType)) return false;
                return sgName === dbName && sgType === dbType;
            });
        }
        if (!snap) {
            return dbGoal;
        }

        const merged = {
            ...dbGoal,
            goal_id: snap.goal_id != null ? snap.goal_id : dbGoal.id,
            goal_name: snap.goal_name || snap.name || dbGoal.name,
            goal_type: snap.goal_type,
            goal_type_id: snap.goal_type_id != null ? snap.goal_type_id : dbGoal.goal_type_id,
            risk_profile: snap.risk_profile != null ? snap.risk_profile : dbGoal.risk_profile,
            summary: snap.summary,
            details: snap.details
        };
        if (snap.error != null) {
            merged.error = snap.error;
        }
        return merged;
    });

    return clientObj;
}

module.exports = {
    extractSnapshotGoals,
    mergeGoalsWithSnapshot
};
