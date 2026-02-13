const db = require('../config/database');

class PdsSettingsRepository {
    /**
     * Получить настройки ПДС (всегда одна запись)
     */
    async find(projectId = null) {
        const query = db('pds_settings');
        if (projectId) {
            return query.where((builder) => {
                builder.where('project_id', projectId).orWhereNull('project_id');
            })
                .orderBy('project_id', 'desc')
                .first();
        }
        return query.whereNull('project_id').first();
    }

    /**
     * Обновить настройки ПДС
     */
    async update(data, projectId = null) {
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

        const query = db('pds_settings');
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }

        return query.update(updateData);
    }
}

module.exports = new PdsSettingsRepository();

