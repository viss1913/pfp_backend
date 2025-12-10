const db = require('../config/database');

class ProductRepository {
    async findAll({ agentId, includeDefaults = true, filters = {} }) {
        const query = db('products').select('*');

        // Multi-tenancy logic
        query.where((builder) => {
            builder.where('products.agent_id', agentId);
            if (includeDefaults) {
                builder.orWhereNull('products.agent_id');
            }
        });

        // Filters
        if (filters.product_type) {
            query.where('products.product_type', filters.product_type);
        }
        if (filters.is_active !== undefined) {
            query.where('products.is_active', filters.is_active);
        }

        const rows = await query;

        // Parse JSON lines (MySQL returns string for JSON sometimes)
        return rows.map(row => ({
            ...row,
            lines: row.lines ? (typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines) : []
        }));
    }

    async findById(id) {
        const product = await db('products').where({ id }).first();
        if (!product) return null;

        // Parse JSON lines
        product.lines = product.lines ? (typeof product.lines === 'string' ? JSON.parse(product.lines) : product.lines) : [];
        return product;
    }

    async create(productData, linesData) {
        const dataToInsert = {
            ...productData,
            lines: linesData && linesData.length > 0 ? JSON.stringify(linesData) : null
        };
        
        const [id] = await db('products').insert(dataToInsert);
        return id;
    }

    async update(id, productData, linesData) {
        const dataToUpdate = {
            ...productData,
            updated_at: new Date() // Knex doesn't auto update updated_at usually
        };

        if (linesData !== undefined) {
            dataToUpdate.lines = linesData && linesData.length > 0 ? JSON.stringify(linesData) : null;
        }

        await db('products').where({ id }).update(dataToUpdate);
    }

    async softDelete(id) {
        return db('products').where({ id }).update({ is_active: false });
    }
}

module.exports = new ProductRepository();
