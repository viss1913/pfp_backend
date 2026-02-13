const productTypeRepository = require('../repositories/productTypeRepository');

class ProductTypeService {
    async getAllProductTypes(projectId = null, filters = {}) {
        return productTypeRepository.findAll(projectId, filters);
    }

    async getProductTypeById(id, projectId = null) {
        return productTypeRepository.findById(id, projectId);
    }

    async getProductTypeByCode(code, projectId = null) {
        return productTypeRepository.findByCode(code, projectId);
    }

    async createProductType(projectId, data) {
        // Проверяем уникальность кода
        const exists = await productTypeRepository.existsByCode(data.code);
        if (exists) {
            throw { status: 400, message: `Product type with code "${data.code}" already exists` };
        }

        const productTypeData = { ...data, project_id: projectId };
        const id = await productTypeRepository.create(productTypeData);
        return this.getProductTypeById(id, projectId);
    }

    async updateProductType(id, data) {
        const productType = await productTypeRepository.findById(id);
        if (!productType) {
            throw { status: 404, message: 'Product type not found' };
        }

        // Проверяем уникальность кода, если он изменяется
        if (data.code && data.code !== productType.code) {
            const exists = await productTypeRepository.existsByCode(data.code, id);
            if (exists) {
                throw { status: 400, message: `Product type with code "${data.code}" already exists` };
            }
        }

        await productTypeRepository.update(id, data);
        return this.getProductTypeById(id);
    }

    async deleteProductType(id) {
        const productType = await productTypeRepository.findById(id);
        if (!productType) {
            throw { status: 404, message: 'Product type not found' };
        }

        // Проверяем, используется ли тип в продуктах
        const db = require('../config/database');
        const productsCount = await db('products').where({ product_type: productType.code }).count('* as count').first();

        if (parseInt(productsCount.count) > 0) {
            throw {
                status: 400,
                message: `Cannot delete product type: it is used by ${productsCount.count} product(s). Deactivate it instead.`
            };
        }

        await productTypeRepository.delete(id);
        return { success: true };
    }
}

module.exports = new ProductTypeService();
















