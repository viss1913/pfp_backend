const BaseRecalculator = require('./BaseRecalculator');

class DefaultRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'monthly_replenishment',
            'avg_monthly_income'
        ];
    }
}

// Just a generic one for HomeOwners, Rent, etc. if they don't have special rules yet
module.exports = new DefaultRecalculator();
