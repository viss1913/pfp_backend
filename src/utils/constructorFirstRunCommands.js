function normalizeConstructorCmdKey(cmdKey) {
    return (cmdKey || '').trim().toLowerCase().replace(/\s+/g, '');
}

function parseMoneyishNumber(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v)
        .replace(/\s/g, '')
        .replace(/\u00a0/g, '')
        .replace(/,/g, '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * Стадия сбора капитала/пополнения/дохода после «не знаю ИПК».
 * Сама /INVESTMENT2 расчёт НЕ запускает — оркестратор уводит на /firstRunAIB2C.
 */
function isInvestment2StageCommand(cmdKey) {
    const k = normalizeConstructorCmdKey(cmdKey);
    if (!k.startsWith('/')) return false;
    const slug = k.slice(1).replace(/-/g, '_');
    return slug === 'investment2' || slug === 'investment_2' || slug.endsWith('investment2');
}

/** @deprecated имя: это стадия сбора, не first-run. */
function isInvestment2FirstRunCommand(cmdKey) {
    return isInvestment2StageCommand(cmdKey);
}

/**
 * Команды сценария, при которых вызывается calculateFirstRun.
 * /INVESTMENT2 сюда не входит: это сбор, расчёт идёт через /firstRunAIB2C.
 */
function isFirstRunCalculationCommand(cmdKey) {
    const k = normalizeConstructorCmdKey(cmdKey);
    if (!k.startsWith('/')) return false;
    if (k === '/firstrun' || k === '/firstrunaib2c' || k === '/first_run_aib2c') return true;
    if (k.includes('firstrun')) return true;
    const slug = k.slice(1).replace(/-/g, '_');
    return slug.includes('first_run');
}

/**
 * Пришли с /INVESTMENT2 на /firstRunAIB2C: цель INVESTMENT, пенсионный контекст диалога игнорировать.
 */
function shouldForceInvestmentGoalOnFirstRun(firstRunCmdKey, previousStageCmdKey) {
    if (!isFirstRunCalculationCommand(firstRunCmdKey)) return false;
    return isInvestment2StageCommand(previousStageCmdKey);
}

/**
 * /INVESTMENT2: одна цель INVESTMENT из капитала/пополнения; пенсия и ИПК из диалога отбрасываются.
 */
function applyInvestment2ExtractionOverride(extraction) {
    if (!extraction || typeof extraction !== 'object') return extraction;
    if (!extraction.client || typeof extraction.client !== 'object') {
        extraction.client = {};
    }
    const c = extraction.client;
    delete c.ipk_current;
    delete c.ops_capital;

    if (!Array.isArray(extraction.goals)) extraction.goals = [];
    const invest = extraction.goals.find((g) => Number(g?.goal_type_id) === 3);
    const src = invest && typeof invest === 'object' ? invest : extraction.goals[0] || {};

    const fromGoal = parseMoneyishNumber(src.initial_capital);
    const fromClient = parseMoneyishNumber(c.total_liquid_capital);
    let initial = 0;
    if (Number.isFinite(fromGoal) && fromGoal >= 0) initial = fromGoal;
    else if (Number.isFinite(fromClient) && fromClient >= 0) initial = fromClient;
    if (!Number.isFinite(fromClient) || fromClient < 0) {
        c.total_liquid_capital = initial;
    }

    let replen = parseMoneyishNumber(invest?.monthly_replenishment);
    if (!Number.isFinite(replen) || replen < 0) {
        replen = NaN;
        for (const g of extraction.goals) {
            const r = parseMoneyishNumber(g?.monthly_replenishment);
            if (Number.isFinite(r) && r >= 0 && (!Number.isFinite(replen) || r > replen)) {
                replen = r;
            }
        }
    }
    const monthly = Number.isFinite(replen) && replen >= 0 ? replen : 0;

    extraction.goals = [
        {
            goal_type_id: 3,
            name: 'Сохранить и приумножить',
            target_amount: 0,
            initial_capital: initial,
            monthly_replenishment: monthly,
            risk_profile: 'BALANCED',
        },
    ];
    return extraction;
}

module.exports = {
    normalizeConstructorCmdKey,
    isInvestment2StageCommand,
    isInvestment2FirstRunCommand,
    isFirstRunCalculationCommand,
    shouldForceInvestmentGoalOnFirstRun,
    applyInvestment2ExtractionOverride,
};
