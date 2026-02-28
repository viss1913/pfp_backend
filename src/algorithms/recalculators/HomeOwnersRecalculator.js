const BaseRecalculator = require('./BaseRecalculator');

class HomeOwnersRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'monthly_replenishment',
            'avg_monthly_income'
        ];
    }
}

module.exports = new HomeOwnersRecalculator();
