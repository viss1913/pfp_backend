const BaseRecalculator = require('./BaseRecalculator');

class PassiveIncomeRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'desired_monthly_income',
            'monthly_replenishment',
            'avg_monthly_income'
        ];
    }
}

module.exports = new PassiveIncomeRecalculator();
