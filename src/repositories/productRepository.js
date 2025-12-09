const db = require('../config/database');

class ProductRepository {
    async findAll({ agentId, includeDefaults = true, filters = {} }) {
        const query = db('products')
            .leftJoin('product_yields', 'products.id', 'product_yields.product_id')
            .select(
                'products.*',
                db.raw('JSON_ARRAYAGG(JSON_OBJECT("term_from_months", product_yields.term_from_months, "term_to_months", product_yields.term_to_months, "amount_from", product_yields.amount_from, "amount_to", product_yields.amount_to, "yield_percent", product_yields.yield_percent)) as yields')
            )
            .groupBy('products.id');

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

        // Parse JSON yields (MySQL returns string for JSON_ARRAYAGG sometimes)
        return rows.map(row => ({
            ...row,
            yields: typeof row.yields === 'string' ? JSON.parse(row.yields) : (row.yields || [])
        }));
    }

    async findById(id) {
        const product = await db('products').where({ id }).first();
        if (!product) return null;

        const yields = await db('product_yields').where({ product_id: id });
        product.yields = yields;
        return product;
    }

    async create(productData, yieldsData) {
        return db.transaction(async (trx) => {
            const [id] = await trx('products').insert(productData);

            if (yieldsData && yieldsData.length > 0) {
                const yieldsWithId = yieldsData.map(y => ({ ...y, product_id: id }));
                await trx('product_yields').insert(yieldsWithId);
            }

            return id;
        });
    }

    async update(id, productData, yieldsData) {
        return db.transaction(async (trx) => {
            await trx('products').where({ id }).update({ ...productData, updated_at: new Date() }); // Knex doesn't auto update updated_at usually

            if (yieldsData) {
                // Replace yields mechanism
                await trx('product_yields').where({ product_id: id }).del();
                if (yieldsData.length > 0) {
                    const yieldsWithId = yieldsData.map(y => ({ ...y, product_id: id }));
                    await trx('product_yields').insert(yieldsWithId);
                }
            }
        });
    }

    async softDelete(id) {
        return db('products').where({ id }).update({ is_active: false });
    }
}

module.exports = new ProductRepository();
