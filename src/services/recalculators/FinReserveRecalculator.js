const BaseRecalculator = require('./BaseRecalculator');

class FinReserveRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'monthly_replenishment',
            'avg_monthly_income'
        ];
    }
}

module.exports = new FinReserveRecalculator();
