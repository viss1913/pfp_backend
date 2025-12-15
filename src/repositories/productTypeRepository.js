const db = require('../config/database');

class ProductTypeRepository {
    async findAll(filters = {}) {
        const query = db('product_types').select('*');

        if (filters.is_active !== undefined) {
            query.where('is_active', filters.is_active);
        }

        query.orderBy('order_index', 'asc');
        query.orderBy('name', 'asc');

        return query;
    }

    async findById(id) {
        return db('product_types').where({ id }).first();
    }

    async findByCode(code) {
        return db('product_types').where({ code }).first();
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


