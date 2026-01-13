const agentService = require('../services/agentService');

class AgentController {
    /**
     * GET /api/agents
     * Sync endpoint for SMM service
     */
    async getAll(req, res, next) {
        try {
            // SMM service will use x-api-key which maps to an agent record or admin
            // For general sync, we check if it's an admin or a valid service key
            if (req.user.role !== 'admin' && !req.user.isApiKey) {
                return res.status(403).json({ error: 'Forbidden: Admin or API Key required' });
            }

            const filters = {
                updated_since: req.query.updated_since,
                is_active: req.query.is_active
            };

            const agents = await agentService.getAllAgentsForSync(filters);
            res.json(agents);
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/agents
     * Create a new agent profile
     */
    async create(req, res, next) {
        try {
            // Only admins can create agents
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden: Admin role required' });
            }

            const newAgent = await agentService.createAgent(req.body);
            res.status(201).json(newAgent);
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/agents/:id
     */
    async getById(req, res, next) {
        try {
            const agent = await agentService.getAgentById(req.params.id);
            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }
            res.json(agent);
        } catch (err) {
            next(err);
        }
    }

    /**
     * PATCH /api/agents/:id
     * Update agent details (including SMM specific fields)
     */
    async update(req, res, next) {
        try {
            const agentId = req.params.id;

            // Check permissions: admin or the agent themselves
            if (req.user.role !== 'admin' && req.user.agentId !== parseInt(agentId)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const updatedAgent = await agentService.updateAgent(agentId, req.body);
            res.json(updatedAgent);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AgentController();
