const db = require('../config/database');

class ProductRepository {
    async findAll({ projectId = null, includeDefaults = true, filters = {} }) {
        const query = db('products')
            .select('products.*');

        // Multi-tenancy logic
        query.where((builder) => {
            if (projectId) {
                builder.where('products.project_id', projectId);
                if (includeDefaults) {
                    builder.orWhereNull('products.project_id');
                }
            }
        });

        // Filters
        if (filters.agent_id) {
            query.where('products.agent_id', filters.agent_id);
        }
        if (filters.product_type) {
            query.where('products.product_type', filters.product_type);
        }
        if (filters.is_active !== undefined) {
            query.where('products.is_active', filters.is_active);
        }

        const rows = await query;

        // Parse lines JSON and convert to yields format for compatibility
        return rows.map(row => {
            let yields = [];
            if (row.lines) {
                try {
                    const lines = typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines;
                    // Ensure lines is an array
                    if (Array.isArray(lines)) {
                        // Convert from lines format (min_term_months, max_term_months, min_amount, max_amount, yield_percent)
                        // to yields format (term_from_months, term_to_months, amount_from, amount_to, yield_percent)
                        yields = lines.map(line => ({
                            term_from_months: line.min_term_months || line.term_from_months || 0,
                            term_to_months: line.max_term_months || line.term_to_months || 0,
                            amount_from: line.min_amount || line.amount_from || 0,
                            amount_to: line.max_amount || line.amount_to || 0,
                            yield_percent: line.yield_percent || 0
                        }));
                    }
                } catch (error) {
                    console.error(`Error parsing lines JSON for product ${row.id}:`, error);
                    // Continue with empty yields array if JSON is invalid
                    yields = [];
                }
            }
            return {
                ...row,
                yields: yields
            };
        });
    }

    async findById(id, projectId = null) {
        let query = db('products').where({ id });

        if (projectId) {
            query.where((builder) => {
                builder.where({ project_id: projectId }).orWhereNull('project_id');
            });
        }

        const product = await query.orderBy('project_id', 'desc').first();
        if (!product) return null;

        // Parse lines JSON and convert to yields format for compatibility
        let yields = [];
        if (product.lines) {
            try {
                const lines = typeof product.lines === 'string' ? JSON.parse(product.lines) : product.lines;
                // Ensure lines is an array
                if (Array.isArray(lines)) {
                    // Convert from lines format (min_term_months, max_term_months, min_amount, max_amount, yield_percent)
                    // to yields format (term_from_months, term_to_months, amount_from, amount_to, yield_percent)
                    yields = lines.map(line => ({
                        term_from_months: line.min_term_months || line.term_from_months || 0,
                        term_to_months: line.max_term_months || line.term_to_months || 0,
                        amount_from: line.min_amount || line.amount_from || 0,
                        amount_to: line.max_amount || line.amount_to || 0,
                        yield_percent: line.yield_percent || 0
                    }));
                }
            } catch (error) {
                console.error(`Error parsing lines JSON for product ${id}:`, error);
                // Continue with empty yields array if JSON is invalid
                yields = [];
            }
        }
        product.yields = yields;
        return product;
    }

    async create(productData, yieldsData) {
        return db.transaction(async (trx) => {
            // Convert yieldsData to lines format if provided
            if (yieldsData && yieldsData.length > 0) {
                const lines = yieldsData.map(y => ({
                    min_term_months: y.term_from_months || y.min_term_months || 0,
                    max_term_months: y.term_to_months || y.max_term_months || 0,
                    min_amount: y.amount_from || y.min_amount || 0,
                    max_amount: y.amount_to || y.max_amount || 0,
                    yield_percent: y.yield_percent || 0
                }));
                productData.lines = JSON.stringify(lines);
            } else if (productData.lines !== undefined) {
                // If lines is provided directly in productData, serialize it to JSON string
                if (productData.lines === null || productData.lines === '') {
                    productData.lines = null;
                } else if (Array.isArray(productData.lines)) {
                    productData.lines = JSON.stringify(productData.lines);
                } else if (typeof productData.lines === 'string') {
                    // Already a string, but ensure it's valid JSON
                    try {
                        JSON.parse(productData.lines);
                        // Valid JSON string, keep as is
                    } catch (e) {
                        // Invalid JSON, try to parse as if it's already an object
                        throw new Error('Invalid JSON format for lines field');
                    }
                } else if (typeof productData.lines === 'object') {
                    // Single object, wrap in array
                    productData.lines = JSON.stringify([productData.lines]);
                }
            }

            const [id] = await trx('products').insert(productData);
            return id;
        });
    }

    async update(id, productData, yieldsData, projectId = null) {
        return db.transaction(async (trx) => {
            // Convert yieldsData to lines format if provided
            if (yieldsData !== undefined) {
                if (yieldsData && yieldsData.length > 0) {
                    const lines = yieldsData.map(y => ({
                        min_term_months: y.term_from_months || y.min_term_months || 0,
                        max_term_months: y.term_to_months || y.max_term_months || 0,
                        min_amount: y.amount_from || y.min_amount || 0,
                        max_amount: y.amount_to || y.max_amount || 0,
                        yield_percent: y.yield_percent || 0
                    }));
                    productData.lines = JSON.stringify(lines);
                } else {
                    productData.lines = null;
                }
            } else if (productData.lines !== undefined) {
                // If lines is provided directly in productData, serialize it to JSON string
                if (productData.lines === null || productData.lines === '') {
                    productData.lines = null;
                } else if (Array.isArray(productData.lines)) {
                    productData.lines = JSON.stringify(productData.lines);
                } else if (typeof productData.lines === 'string') {
                    // Already a string, but ensure it's valid JSON
                    try {
                        JSON.parse(productData.lines);
                        // Valid JSON string, keep as is
                    } catch (e) {
                        // Invalid JSON, try to parse as if it's already an object
                        throw new Error('Invalid JSON format for lines field');
                    }
                } else if (typeof productData.lines === 'object') {
                    // Single object, wrap in array
                    productData.lines = JSON.stringify([productData.lines]);
                }
            }

            const query = trx('products').where({ id });
            if (projectId) query.where({ project_id: projectId });
            await query.update({ ...productData, updated_at: new Date() });
        });
    }

    async softDelete(id, projectId = null) {
        const query = db('products').where({ id });
        if (projectId) query.where({ project_id: projectId });
        return query.update({ is_active: false });
    }

    async findByName(name, projectId = null) {
        const products = await this.findAll({ projectId, includeDefaults: true });
        return products.find(p => p.name === name) || null;
    }
}

module.exports = new ProductRepository();
