const BaseRecalculator = require('./BaseRecalculator');

class PensionRecalculator extends BaseRecalculator {
    getNumericFields() {
        return [
            ...super.getNumericFields(),
            'desired_monthly_income',
            'ops_capital',
            'ipk_current',
            'ipk_forecast',
            'ipk_total',
            'retirement_age',
            'avg_monthly_income'
        ];
    }

    prepare(existing, patch) {
        const result = super.prepare(existing, patch);

        // Front-end often sends 'desired_monthly_income' for pension, 
        // but PensionCalculator uses 'target_amount' for the main simulation.
        // We sync them here to ensure the calculation reflects the change.
        if (patch.desired_monthly_income !== undefined && patch.desired_monthly_income !== null) {
            result.target_amount = Number(patch.desired_monthly_income);
        }

        return result;
    }
}

module.exports = new PensionRecalculator();
