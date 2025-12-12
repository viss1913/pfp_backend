const db = require('../config/database');

class PdsSettingsRepository {
    /**
     * Получить настройки ПДС (всегда одна запись)
     */
    async find() {
        return db('pds_settings').first();
    }

    /**
     * Обновить настройки ПДС
     */
    async update(data) {
        const updateData = {};
        if (data.max_state_cofin_amount_per_year !== undefined) {
            updateData.max_state_cofin_amount_per_year = parseInt(data.max_state_cofin_amount_per_year);
        }
        if (data.min_contribution_for_support_per_year !== undefined) {
            updateData.min_contribution_for_support_per_year = parseInt(data.min_contribution_for_support_per_year);
        }
        if (data.income_basis !== undefined) {
            updateData.income_basis = data.income_basis;
        }
        updateData.updated_at = new Date();

        return db('pds_settings')
            .update(updateData);
    }
}

module.exports = new PdsSettingsRepository();

