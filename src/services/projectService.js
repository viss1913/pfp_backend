const projectRepository = require('../repositories/projectRepository');
const crypto = require('crypto');

class ProjectService {
    async getAllProjects(filters = {}) {
        return projectRepository.findAll(filters);
    }

    async getProjectById(id) {
        return projectRepository.findById(id);
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
            data.settings = JSON.stringify(data.settings);
        }
        return projectRepository.update(id, data);
    }

    async suspendProject(id) {
        return projectRepository.delete(id);
    }
}

module.exports = new ProjectService();
