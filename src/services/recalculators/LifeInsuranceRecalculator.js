const BaseRecalculator = require('./BaseRecalculator');

class LifeInsuranceRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'avg_monthly_income'
        ];
    }
}

module.exports = new LifeInsuranceRecalculator();
