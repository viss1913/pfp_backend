const productRepository = require('../repositories/productRepository');
const { extractSnapshotGoals } = require('./mergeGoalsWithSnapshot');

/**
 * Дописывает product_type по имени продукта (products.name), если в снимке поле отсутствует.
 * Мутирует объекты внутри clientObj.goals_summary.
 */
async function enrichInstrumentArray(list, projectId) {
    if (!Array.isArray(list) || !projectId) return;
    for (const inst of list) {
        if (!inst || typeof inst !== 'object') continue;
        const nm = inst.name != null ? String(inst.name).trim() : '';
        if (!nm) continue;
        if (inst.product_type != null && String(inst.product_type).trim() !== '') continue;
        const p = await productRepository.findByName(nm, projectId);
        if (p && p.product_type) {
            inst.product_type = String(p.product_type).toUpperCase().trim();
        }
    }
}

async function enrichConsolidated(summary, projectId) {
    if (!summary || !summary.consolidated_portfolio || !projectId) return;
    const cp = summary.consolidated_portfolio;
    await enrichInstrumentArray(cp.assets_allocation, projectId);
    await enrichInstrumentArray(cp.cash_flow_allocation, projectId);
}

async function enrichGoalDetails(details, projectId) {
    if (!details || !projectId) return;
    await enrichInstrumentArray(details.initial_instruments, projectId);
    await enrichInstrumentArray(details.monthly_instruments, projectId);
    await enrichInstrumentArray(details.initial_capital_instruments, projectId);
    await enrichInstrumentArray(details.monthly_savings_instruments, projectId);
    const ps = details.portfolio_structure;
    if (ps && typeof ps === 'object') {
        await enrichInstrumentArray(ps.initial_instruments, projectId);
        await enrichInstrumentArray(ps.monthly_instruments, projectId);
    }
}

async function enrichGoalsSummaryProductTypes(clientObj, projectId) {
    if (!clientObj || !projectId) return;
    const gs = clientObj.goals_summary;
    if (!gs || typeof gs !== 'object') return;

    const summary = gs.summary || (gs.calculation && gs.calculation.summary);
    if (summary) await enrichConsolidated(summary, projectId);

    const goals = extractSnapshotGoals(gs);
    if (goals) {
        for (const g of goals) {
            if (g && g.details) await enrichGoalDetails(g.details, projectId);
        }
    }
}

module.exports = {
    enrichGoalsSummaryProductTypes,
};
