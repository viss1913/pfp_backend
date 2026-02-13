const db = require('../config/database');

class ProductTypeRepository {
    async findAll(projectId = null, filters = {}) {
        const query = db('product_types').select('*');

        if (projectId) {
            query.where(builder => {
                builder.where({ project_id: projectId }).orWhereNull('project_id');
            });
        }

        if (filters.is_active !== undefined) {
            query.where('is_active', filters.is_active);
        }

        query.orderBy('order_index', 'asc');
        query.orderBy('name', 'asc');

        return query;
    }

    async findById(id, projectId = null) {
        let query = db('product_types').where({ id });
        if (projectId) {
            query.where(builder => {
                builder.where({ project_id: projectId }).orWhereNull('project_id');
            });
        }
        return query.first();
    }

    async findByCode(code, projectId = null) {
        let query = db('product_types').where({ code });
        if (projectId) {
            query.where(builder => {
                builder.where({ project_id: projectId }).orWhereNull('project_id');
            });
        }
        return query.first();
    }

    async create(data) {
        const [id] = await db('product_types').insert(data);
        return id;
    }

    async update(id, data) {
        await db('product_types').where({ id }).update({ ...data, updated_at: new Date() });
    }

    async delete(id) {
        await db('product_types').where({ id }).del();
    }

    async existsByCode(code, excludeId = null) {
        const query = db('product_types').where({ code });
        if (excludeId) {
            query.whereNot({ id: excludeId });
        }
        const result = await query.first();
        return !!result;
    }
}

module.exports = new ProductTypeRepository();
















