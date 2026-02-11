const BaseRecalculator = require('./BaseRecalculator');

class InvestmentRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'monthly_replenishment',
            'avg_monthly_income'
        ];
    }
}

module.exports = new InvestmentRecalculator();
