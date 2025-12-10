const settingsRepository = require('../repositories/settingsRepository');

class SettingsService {
    async getAllSettings(category = null) {
        const settings = await settingsRepository.findAll(category);

        // Парсим значения для удобства
        return settings.map(s => ({
            key: s.key,
            value: this._parseValue(s.value, s.value_type),
            description: s.description,
            category: s.category,
            updated_at: s.updated_at
        }));
    }

    async getSettingByKey(key) {
        const setting = await settingsRepository.findByKey(key);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        return {
            key: setting.key,
            value: this._parseValue(setting.value, setting.value_type),
            description: setting.description,
            category: setting.category,
            updated_at: setting.updated_at
        };
    }

    async updateSetting(key, value, isAdmin) {
        // Только админ может менять настройки
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can update settings' };
        }

        const setting = await settingsRepository.findByKey(key);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        await settingsRepository.updateByKey(key, value);
        return this.getSettingByKey(key);
    }

    async createSetting(data, isAdmin) {
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can create settings' };
        }

        const existing = await settingsRepository.findByKey(data.key);
        if (existing) {
            throw { status: 400, message: 'Setting with this key already exists' };
        }

        const id = await settingsRepository.create(data);
        return this.getSettingByKey(data.key);
    }

    async deleteSetting(key, isAdmin) {
        if (!isAdmin) {
            throw { status: 403, message: 'Only admin can delete settings' };
        }

        const setting = await settingsRepository.findByKey(key);
        if (!setting) throw { status: 404, message: 'Setting not found' };

        await settingsRepository.delete(key);
        return { success: true };
    }

    // Вспомогательный метод для парсинга значений
    _parseValue(value, type) {
        switch (type) {
            case 'number':
                return parseFloat(value);
            case 'json':
                return JSON.parse(value);
            default:
                return value;
        }
    }

    // Метод для получения конкретного значения (для использования в расчётах)
    async getValue(key) {
        return settingsRepository.getValue(key);
    }

    // Алиас для getValue (для удобства использования в расчетах)
    async get(key) {
        const setting = await settingsRepository.findByKey(key);
        if (!setting) return null;
        
        return {
            key: setting.key,
            value: this._parseValue(setting.value, setting.value_type),
            description: setting.description,
            category: setting.category,
            updated_at: setting.updated_at
        };
    }
}

module.exports = new SettingsService();
