const settingsService = require('../services/settingsService');
const Joi = require('joi');

const settingSchema = Joi.object({
    key: Joi.string().required(),
    value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.object()).required(),
    description: Joi.string().allow(null, ''),
    category: Joi.string().allow(null, '')
});

const updateSettingSchema = Joi.object({
    value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.object()).required()
});

class SettingsController {
    async getAll(req, res, next) {
        try {
            const { category } = req.query;
            const settings = await settingsService.getAllSettings(category);
            res.json(settings);
        } catch (err) {
            next(err);
        }
    }

    async getByKey(req, res, next) {
        try {
            const { key } = req.params;
            const setting = await settingsService.getSettingByKey(key);
            res.json(setting);
        } catch (err) {
            next(err);
        }
    }

    async update(req, res, next) {
        try {
            const { key } = req.params;
            const isAdmin = req.user.isAdmin;

            const validation = updateSettingSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const updated = await settingsService.updateSetting(key, req.body.value, isAdmin);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    }

    async create(req, res, next) {
        try {
            const isAdmin = req.user.isAdmin;

            const validation = settingSchema.validate(req.body);
            if (validation.error) {
                return res.status(400).json({ error: validation.error.details[0].message });
            }

            const created = await settingsService.createSetting(req.body, isAdmin);
            res.status(201).json(created);
        } catch (err) {
            next(err);
        }
    }

    async delete(req, res, next) {
        try {
            const { key } = req.params;
            const isAdmin = req.user.isAdmin;

            await settingsService.deleteSetting(key, isAdmin);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new SettingsController();
