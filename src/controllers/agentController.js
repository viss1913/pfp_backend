const agentService = require('../services/agentService');

class AgentController {
    /**
     * GET /api/agents
     * Sync endpoint for SMM service
     */
    async getAll(req, res, next) {
        try {
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
            if (!isAdmin && !req.user.isApiKey) {
                return res.status(403).json({ error: 'Forbidden: Admin or API Key required' });
            }

            const projectId = req.user.projectId || req.projectId;
            const filters = {
                updated_since: req.query.updated_since,
                is_active: req.query.is_active
            };

            const agents = await agentService.getAllAgentsForSync(projectId, filters);
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
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
            if (!isAdmin) {
                return res.status(403).json({ error: 'Forbidden: Admin role required' });
            }

            const projectId = req.user.projectId || req.projectId;
            const newAgent = await agentService.createAgent(projectId, req.body);
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
            const projectId = req.user.projectId || req.projectId;
            const agent = await agentService.getAgentById(req.params.id, projectId);
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
            const projectId = req.user.projectId || req.projectId;
            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);

            // Check permissions: admin or the agent themselves
            if (!isAdmin && req.user.agentId !== parseInt(agentId)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const updatedAgent = await agentService.updateAgent(agentId, projectId, req.body);
            res.json(updatedAgent);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AgentController();
