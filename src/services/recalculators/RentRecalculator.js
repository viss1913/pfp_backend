const BaseRecalculator = require('./BaseRecalculator');

class RentRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'avg_monthly_income'
        ];
    }
}

module.exports = new RentRecalculator();
