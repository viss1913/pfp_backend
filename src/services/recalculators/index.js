const pensionRecalculator = require('./PensionRecalculator');
const passiveIncomeRecalculator = require('./PassiveIncomeRecalculator');
const investmentRecalculator = require('./InvestmentRecalculator');
const homeOwnersRecalculator = require('./HomeOwnersRecalculator');
const lifeInsuranceRecalculator = require('./LifeInsuranceRecalculator');
const finReserveRecalculator = require('./FinReserveRecalculator');
const rentRecalculator = require('./RentRecalculator');
const defaultRecalculator = require('./DefaultRecalculator');

const RECALCULATORS = {
    1: pensionRecalculator,    // PENSION
    2: passiveIncomeRecalculator, // PASSIVE_INCOME
    3: investmentRecalculator, // INVESTMENT
    4: homeOwnersRecalculator, // HOME_OWNERS
    5: lifeInsuranceRecalculator, // LIFE_INSURANCE
    6: pensionRecalculator,    // PDS (uses pension logic)
    7: finReserveRecalculator, // FIN_RESERVE
    8: rentRecalculator        // RENT (Ежемесячный процент)
};

/**
 * Get the appropriate recalculator for a goal type
 * @param {number|string} goalTypeId 
 * @returns {BaseRecalculator}
 */
function get(goalTypeId) {
    return RECALCULATORS[Number(goalTypeId)] || defaultRecalculator;
}

/**
 * Sync fields and prepare goal patch
 */
function prepare(existing, patch) {
    const typeId = patch.goal_type_id || existing.goal_type_id;
    const rebuilder = get(typeId);
    return rebuilder.prepare(existing, patch);
}

module.exports = {
    get,
    prepare
};
