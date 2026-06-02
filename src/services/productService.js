const productRepository = require('../repositories/productRepository');
const { validateIszhProductLines } = require('../utils/validateIszhProductLines');
const { validateCommissionSchema } = require('../utils/validateCommissionSchema');

function parseLinesFromPayload(data) {
    if (!data || data.lines == null) return null;
    if (Array.isArray(data.lines)) return data.lines;
    if (typeof data.lines === 'string') {
        try {
            const p = JSON.parse(data.lines);
            if (Array.isArray(p)) return p;
            if (p && typeof p === 'object') return [p];
            return null;
        } catch {
            return null;
        }
    }
    if (typeof data.lines === 'object') {
        return Array.isArray(data.lines) ? data.lines : [data.lines];
    }
    return null;
}

function assertIszhLinesIfNeeded(data) {
    const pt = String(data.product_type || '').toUpperCase().trim();
    const lines = parseLinesFromPayload(data);
    if (pt !== 'ISZH' || !lines || !lines.length) return;
    const v = validateIszhProductLines(lines);
    if (!v.ok) {
        const err = new Error(v.error);
        err.status = 400;
        throw err;
    }
}

function normalizeCommissionSchema(data) {
    if (!Object.prototype.hasOwnProperty.call(data || {}, 'commission_schema')) return data;
    const check = validateCommissionSchema(data.commission_schema);
    if (!check.ok) {
        const err = new Error(check.error);
        err.status = 400;
        throw err;
    }
    return {
        ...data,
        commission_schema: check.normalized,
    };
}

class ProductService {
    async getAllProducts(projectId, query) {
        const { includeDefaults = 'true', product_type, is_active } = query;
        const filters = {};
        if (product_type) filters.product_type = product_type;
        if (is_active !== undefined) {
            filters.is_active = is_active === 'true' || is_active === '1' || is_active === true || is_active === 1;
        }

        return productRepository.findAll({
            projectId,
            includeDefaults: includeDefaults === 'true',
            filters
        });
    }

    async getProductById(id, projectId = null) {
        return productRepository.findById(id, projectId);
    }

    async createProduct(agentId, projectId, data) {
        const normalizedInput = normalizeCommissionSchema(data);
        assertIszhLinesIfNeeded(normalizedInput);
        const { yields, ...productFields } = normalizedInput;
        // Ensure agent_id and project_id are set
        productFields.agent_id = agentId;
        productFields.project_id = projectId;

        // Create
        const newId = await productRepository.create(productFields, yields);
        return this.getProductById(newId, projectId);
    }

    async updateProduct(id, agentId, projectId, isAdmin, data) {
        const product = await productRepository.findById(id, projectId);
        if (!product) throw { status: 404, message: 'Product not found' };

        // Permission check
        // If product.project_id is null (default project or global), only admin can edit
        if (product.project_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can edit default products' };
        }
        // If product.agent_id is set, it must match current agentId (unless admin can edit anything?)
        if (product.agent_id !== null && product.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied to this product' };
        }

        const normalizedInput = normalizeCommissionSchema(data);
        const { yields, ...productFields } = normalizedInput;
        const effectiveType = String(productFields.product_type || product.product_type || '').toUpperCase().trim();
        if (effectiveType === 'ISZH') {
            assertIszhLinesIfNeeded({ ...product, ...productFields, lines: productFields.lines !== undefined ? productFields.lines : product.lines });
        }

        await productRepository.update(id, productFields, yields, projectId);
        return this.getProductById(id, projectId);
    }

    async deleteProduct(id, agentId, projectId, isAdmin) {
        const product = await productRepository.findById(id, projectId);
        if (!product) throw { status: 404, message: 'Product not found' };

        if (product.project_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can delete default products' };
        }
        if (product.agent_id !== null && product.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        await productRepository.softDelete(id, projectId);
        return { success: true };
    }

    async cloneProduct(id, agentId, projectId) {
        const product = await productRepository.findById(id, projectId);
        if (!product) throw { status: 404, message: 'Product not found' };

        // Logic: if product is default, create copy for agent.
        if (product.project_id !== null && product.agent_id !== null) {
            throw { status: 400, message: 'Only default or project-global products can be cloned this way' };
        }

        const { id: _, created_at, updated_at, yields, ...productData } = product;
        productData.agent_id = agentId;
        productData.project_id = projectId;
        productData.is_default = false;

        const newYields = (yields || []).map(({ id, product_id, ...y }) => y);

        const newId = await productRepository.create(productData, newYields);
        return this.getProductById(newId, projectId);
    }
}

module.exports = new ProductService();
