const db = require('../config/database');

class SettingsRepository {
    async findAll(category = null) {
        const query = db('system_settings').select('*');
        if (category) {
            query.where('category', category);
        }
        return query;
    }

    async findByKey(key) {
        return db('system_settings').where({ key }).first();
    }

    async getValue(key) {
        const setting = await this.findByKey(key);
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

    async updateByKey(key, value) {
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

        return db('system_settings')
            .where({ key })
            .update({
                value: valueStr,
                value_type: valueType,
                updated_at: new Date()
            });
    }

    async create(settingData) {
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
            category
        });

        return id;
    }

    async delete(key) {
        return db('system_settings').where({ key }).del();
    }
}

module.exports = new SettingsRepository();
