const aiAssistantService = require('../services/aiAssistantService');

class AdminAiController {
    async list(req, res) {
        try {
            const assistants = await aiAssistantService.getAll();
            res.json(assistants);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to list assistants' });
        }
    }

    async create(req, res) {
        try {
            const assistant = await aiAssistantService.create(req.body);
            res.status(201).json(assistant);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create assistant' });
        }
    }

    async update(req, res) {
        try {
            const assistant = await aiAssistantService.update(req.params.id, req.body);
            if (!assistant) return res.status(404).json({ error: 'Assistant not found' });
            res.json(assistant);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update assistant' });
        }
    }

    async delete(req, res) {
        try {
            const count = await aiAssistantService.delete(req.params.id);
            if (count === 0) return res.status(404).json({ error: 'Assistant not found' });
            res.status(204).send();
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete assistant' });
        }
    }
}

module.exports = new AdminAiController();
