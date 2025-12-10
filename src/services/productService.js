const productRepository = require('../repositories/productRepository');

class ProductService {
    async getAllProducts(agentId, query) {
        const { includeDefaults = 'true', product_type, is_active } = query;
        const filters = {};
        if (product_type) filters.product_type = product_type;
        if (is_active !== undefined) filters.is_active = is_active === 'true';

        return productRepository.findAll({
            agentId,
            includeDefaults: includeDefaults === 'true',
            filters
        });
    }

    async getProductById(id) {
        return productRepository.findById(id);
    }

    async createProduct(agentId, data) {
        const { lines, ...productFields } = data;
        // Ensure agent_id is set
        productFields.agent_id = agentId;

        // Create
        const newId = await productRepository.create(productFields, lines);
        return this.getProductById(newId);
    }

    async updateProduct(id, agentId, isAdmin, data) {
        const product = await productRepository.findById(id);
        if (!product) throw { status: 404, message: 'Product not found' };

        // Permission check
        // If product.agent_id is null (default), only admin can edit
        if (product.agent_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can edit default products' };
        }
        // If product.agent_id is set, it must match current agentId (unless admin can edit anything? Assumption: Agents edit only theirs)
        if (product.agent_id !== null && product.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied to this product' };
        }

        const { lines, ...productFields } = data;
        await productRepository.update(id, productFields, lines);
        return this.getProductById(id);
    }

    async deleteProduct(id, agentId, isAdmin) {
        const product = await productRepository.findById(id);
        if (!product) throw { status: 404, message: 'Product not found' };

        if (product.agent_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can delete default products' };
        }
        if (product.agent_id !== null && product.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        await productRepository.softDelete(id);
        return { success: true };
    }

    async cloneProduct(id, agentId) {
        const product = await productRepository.findById(id);
        if (!product) throw { status: 404, message: 'Product not found' };

        // Logic: if product is default, create copy for agent.
        // If product is already owned by someone else, can we clone? 
        // "if product is default (agent_id IS NULL), creates copy with agent_id = current_agent_id"
        if (product.agent_id !== null) {
            throw { status: 400, message: 'Only default products can be cloned this way' };
        }

        const { id: _, created_at, updated_at, lines, ...productData } = product;
        productData.agent_id = agentId;
        productData.is_default = false; // Clones are not default usually

        // lines is already an array from findById, just use it as is
        const newLines = lines || [];

        const newId = await productRepository.create(productData, newLines);
        return this.getProductById(newId);
    }
}

module.exports = new ProductService();
