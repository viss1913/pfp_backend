const db = require('../config/database');

class SettingsRepository {
    async findAll(projectId = null, category = null) {
        const query = db('system_settings').select('*');

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId);
                builder.orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });

        if (category) {
            query.where('category', category);
        }
        return query;
    }

    async findByKey(key, projectId = null) {
        const query = db('system_settings').where({ key });

        if (projectId) {
            // Ищем сначала проектную настройку, затем глобальную
            return query.where((builder) => {
                builder.where('project_id', projectId)
                    .orWhereNull('project_id');
            })
                .orderBy('project_id', 'desc') // Проектная будет выше (not null vs null)
                .first();
        }

        return query.whereNull('project_id').first();
    }

    async getValue(key, projectId = null) {
        const setting = await this.findByKey(key, projectId);
        if (!setting) return null;

        // Парсим значение в зависимости от типа
        switch (setting.value_type) {
            case 'number':
                return parseFloat(setting.value);
            case 'json':
                return JSON.parse(setting.value);
            default:
                return setting.value;
        }
    }

    async updateByKey(key, value, projectId = null) {
        // Определяем тип значения
        let valueType = 'string';
        let valueStr = String(value);

        if (typeof value === 'number') {
            valueType = 'number';
            valueStr = String(value);
        } else if (typeof value === 'object') {
            valueType = 'json';
            valueStr = JSON.stringify(value);
        }

        // Проверяем существование настройки именно для этого проекта (или глобальной, если projectId null)
        const filter = { key };
        if (projectId) {
            filter.project_id = projectId;
        } else {
            // Для супер-админа
            // filter.project_id = null; // Knex where({project_id: null}) работает корректно
            return db('system_settings')
                .where({ key })
                .whereNull('project_id')
                .update({
                    value: valueStr,
                    value_type: valueType,
                    updated_at: new Date()
                });
        }

        return db('system_settings')
            .where(filter)
            .update({
                value: valueStr,
                value_type: valueType,
                updated_at: new Date()
            });
    }

    async create(settingData, projectId = null) {
        const { key, value, description, category } = settingData;

        let valueType = 'string';
        let valueStr = String(value);

        if (typeof value === 'number') {
            valueType = 'number';
            valueStr = String(value);
        } else if (typeof value === 'object') {
            valueType = 'json';
            valueStr = JSON.stringify(value);
        }

        const [id] = await db('system_settings').insert({
            key,
            value: valueStr,
            value_type: valueType,
            description,
            category,
            project_id: projectId
        });

        return id;
    }

    async delete(key, projectId = null) {
        const query = db('system_settings').where({ key });
        if (projectId) {
            query.where('project_id', projectId);
        } else {
            query.whereNull('project_id');
        }
        return query.del();
    }
}

module.exports = new SettingsRepository();
