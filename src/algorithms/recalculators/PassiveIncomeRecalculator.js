const BaseRecalculator = require('./BaseRecalculator');

class PassiveIncomeRecalculator extends BaseRecalculator {
    /**
     * For Passive Income we treat UI "desired income" as a single slider.
     * Исторически оно могло сохраниться и в `desired_monthly_income`, и в `target_amount`.
     * Если с фронта прилетает новый `target_amount` без явного `desired_monthly_income`,
     * считаем, что пользователь менял именно его, и синхронизируем оба поля.
     */
    prepare(existing, patch) {
        const result = super.prepare(existing, patch);

        const hasTargetInPatch = patch && Object.prototype.hasOwnProperty.call(patch, 'target_amount');
        const hasDesiredInPatch = patch && Object.prototype.hasOwnProperty.call(patch, 'desired_monthly_income');

        if (hasTargetInPatch && !hasDesiredInPatch) {
            result.desired_monthly_income = result.target_amount;
        }

        return result;
    }

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
