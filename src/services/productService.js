const productRepository = require('../repositories/productRepository');

class ProductService {
    async getAllProducts(projectId, query) {
        const { includeDefaults = 'true', product_type, is_active } = query;
        const filters = {};
        if (product_type) filters.product_type = product_type;
        if (is_active !== undefined) filters.is_active = is_active === 'true';

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
        const { yields, ...productFields } = data;
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

        const { yields, ...productFields } = data;
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
