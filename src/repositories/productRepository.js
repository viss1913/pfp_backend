const db = require('../config/database');
const { shouldIncludeSystemCatalog } = require('../utils/projectTenantCatalogScope');

/**
 * Нормализация строки products.lines → объект yields[] (в т.ч. матрица ИСЖ: risk_name, age, payment_ratio).
 * @param {Object} line
 * @returns {Object}
 */
function mapProductLineToYield(line) {
    if (!line || typeof line !== 'object') {
        return {
            term_from_months: 0,
            term_to_months: 0,
            amount_from: 0,
            amount_to: 0,
            yield_percent: 0
        };
    }
    const hasRisk = line.risk_name != null && String(line.risk_name).trim() !== '';
    let yp = line.yield_percent;
    if (yp === null || yp === undefined || yp === '') {
        yp = hasRisk ? null : 0;
    } else {
        const n = Number(yp);
        yp = Number.isFinite(n) ? n : (hasRisk ? null : 0);
    }
    const row = {
        term_from_months: line.min_term_months || line.term_from_months || 0,
        term_to_months: line.max_term_months || line.term_to_months || 0,
        amount_from: line.min_amount || line.amount_from || 0,
        amount_to: line.max_amount || line.amount_to || 0,
        yield_percent: yp
    };
    if (hasRisk) {
        row.risk_name = String(line.risk_name).trim();
    }
    if (line.age_from != null && line.age_from !== '') {
        const n = Number(line.age_from);
        if (Number.isFinite(n)) row.age_from = n;
    }
    if (line.age_to != null && line.age_to !== '') {
        const n = Number(line.age_to);
        if (Number.isFinite(n)) row.age_to = n;
    }
    if (line.payment_ratio != null && line.payment_ratio !== '') {
        const n = Number(line.payment_ratio);
        if (Number.isFinite(n)) row.payment_ratio = n;
    }
    return row;
}

function parseJsonValue(value, fallback = null) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

class ProductRepository {
    async findAll({ projectId = null, includeDefaults = true, filters = {} }) {
        const effectiveIncludeDefaults = shouldIncludeSystemCatalog(projectId, includeDefaults);
        const query = db('products')
            .select('products.*');

        // Multi-tenancy logic
        query.where((builder) => {
            if (projectId) {
                builder.where('products.project_id', projectId);
                if (effectiveIncludeDefaults) {
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
                        yields = lines.map((line) => mapProductLineToYield(line));
                    }
                } catch (error) {
                    console.error(`Error parsing lines JSON for product ${row.id}:`, error);
                    // Continue with empty yields array if JSON is invalid
                    yields = [];
                }
            }
            const commissionSchema = parseJsonValue(row.commission_schema, null);
            return {
                ...row,
                commission_schema: commissionSchema,
                yields: yields
            };
        });
    }

    async findById(id, projectId = null) {
        const effectiveIncludeDefaults = shouldIncludeSystemCatalog(projectId, true);
        let query = db('products').where({ id });

        if (projectId) {
            query.where((builder) => {
                builder.where({ project_id: projectId });
                if (effectiveIncludeDefaults) {
                    builder.orWhereNull('project_id');
                }
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
                    yields = lines.map((line) => mapProductLineToYield(line));
                }
            } catch (error) {
                console.error(`Error parsing lines JSON for product ${id}:`, error);
                // Continue with empty yields array if JSON is invalid
                yields = [];
            }
        }
        product.commission_schema = parseJsonValue(product.commission_schema, null);
        product.yields = yields;
        return product;
    }

    async create(productData, yieldsData) {
        return db.transaction(async (trx) => {
            // Convert yieldsData to lines format if provided
            if (yieldsData && yieldsData.length > 0) {
                const lines = yieldsData.map((y) => ({
                    min_term_months: y.term_from_months || y.min_term_months || 0,
                    max_term_months: y.term_to_months || y.max_term_months || 0,
                    min_amount: y.amount_from || y.min_amount || 0,
                    max_amount: y.amount_to || y.max_amount || 0,
                    yield_percent: y.yield_percent,
                    risk_name: y.risk_name,
                    age_from: y.age_from,
                    age_to: y.age_to,
                    payment_ratio: y.payment_ratio
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

            if (Object.prototype.hasOwnProperty.call(productData, 'commission_schema')) {
                if (productData.commission_schema == null || productData.commission_schema === '') {
                    productData.commission_schema = null;
                } else if (typeof productData.commission_schema === 'string') {
                    JSON.parse(productData.commission_schema);
                } else if (typeof productData.commission_schema === 'object') {
                    productData.commission_schema = JSON.stringify(productData.commission_schema);
                } else {
                    throw new Error('Invalid JSON format for commission_schema field');
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
                    const lines = yieldsData.map((y) => ({
                        min_term_months: y.term_from_months || y.min_term_months || 0,
                        max_term_months: y.term_to_months || y.max_term_months || 0,
                        min_amount: y.amount_from || y.min_amount || 0,
                        max_amount: y.amount_to || y.max_amount || 0,
                        yield_percent: y.yield_percent,
                        risk_name: y.risk_name,
                        age_from: y.age_from,
                        age_to: y.age_to,
                        payment_ratio: y.payment_ratio
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

            if (Object.prototype.hasOwnProperty.call(productData, 'commission_schema')) {
                if (productData.commission_schema == null || productData.commission_schema === '') {
                    productData.commission_schema = null;
                } else if (typeof productData.commission_schema === 'string') {
                    JSON.parse(productData.commission_schema);
                } else if (typeof productData.commission_schema === 'object') {
                    productData.commission_schema = JSON.stringify(productData.commission_schema);
                } else {
                    throw new Error('Invalid JSON format for commission_schema field');
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
