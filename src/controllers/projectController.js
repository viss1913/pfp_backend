const projectService = require('../services/projectService');

class ProjectController {
    async getAll(req, res) {
        try {
            const projects = await projectService.getAllProjects(req.query);
            res.json(projects);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const project = await projectService.getProjectById(req.params.id);
            if (!project) return res.status(404).json({ error: 'Project not found' });
            res.json(project);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const project = await projectService.createProject(req.body);
            res.status(201).json(project);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const project = await projectService.updateProject(req.params.id, req.body);
            res.json(project);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async suspend(req, res) {
        try {
            await projectService.suspendProject(req.params.id);
            res.json({ message: 'Project suspended' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ProjectController();
