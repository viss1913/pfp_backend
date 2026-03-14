const projectRepository = require('../repositories/projectRepository');
const crypto = require('crypto');

class ProjectService {
    async getAllProjects(filters = {}) {
        const list = await projectRepository.findAll(filters);
        return (Array.isArray(list) ? list : []).map((p) => {
            if (p?.settings != null) {
                try {
                    p.settings = typeof p.settings === 'string' ? JSON.parse(p.settings) : p.settings;
                } catch (_) { /* leave as is */ }
            }
            return p;
        });
    }

    async getProjectById(id) {
        const project = await projectRepository.findById(id);
        if (project?.settings != null) {
            try {
                project.settings = typeof project.settings === 'string'
                    ? JSON.parse(project.settings)
                    : project.settings;
            } catch (_) { /* leave as is */ }
        }
        return project;
    }

    async getProjectByPublicKey(publicKey) {
        return projectRepository.findByPublicKey(publicKey);
    }

    async createProject(data) {
        if (!data.slug) {
            data.slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }

        if (!data.public_key) {
            data.public_key = 'pk_' + crypto.randomBytes(12).toString('hex');
        }

        return projectRepository.create({
            name: data.name,
            slug: data.slug,
            public_key: data.public_key,
            status: data.status || 'active',
            settings: data.settings ? JSON.stringify(data.settings) : null
        });
    }

    async updateProject(id, data) {
        if (data.settings && typeof data.settings === 'object') {
            const existing = await projectRepository.findById(id);
            const existingSettings = (existing?.settings && typeof existing.settings === 'string')
                ? JSON.parse(existing.settings)
                : (existing?.settings && typeof existing.settings === 'object' ? existing.settings : {});
            const merged = { ...existingSettings, ...data.settings };
            data.settings = JSON.stringify(merged);
        }
        return projectRepository.update(id, data);
    }

    async suspendProject(id) {
        return projectRepository.delete(id);
    }
}

module.exports = new ProjectService();
