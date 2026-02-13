const db = require('../config/database');

class ProjectRepository {
    async findAll(filters = {}) {
        const query = db('projects').select('*');
        if (filters.status) {
            query.where('status', filters.status);
        }
        return query.orderBy('created_at', 'desc');
    }

    async findById(id) {
        return db('projects').where({ id }).first();
    }

    async findBySlug(slug) {
        return db('projects').where({ slug }).first();
    }

    async findByPublicKey(publicKey) {
        return db('projects').where({ public_key: publicKey }).first();
    }

    async create(data) {
        const [id] = await db('projects').insert({
            ...data,
            created_at: new Date(),
            updated_at: new Date()
        }).returning('id');

        const actualId = typeof id === 'object' ? id.id : id;
        return this.findById(actualId);
    }

    async update(id, data) {
        await db('projects').where({ id }).update({
            ...data,
            updated_at: new Date()
        });
        return this.findById(id);
    }

    async delete(id) {
        // Soft delete or hard delete? Let's do status 'suspended' or actual del
        // For project mgmt, we usually just update status
        return db('projects').where({ id }).update({ status: 'suspended', updated_at: new Date() });
    }
}

module.exports = new ProjectRepository();
