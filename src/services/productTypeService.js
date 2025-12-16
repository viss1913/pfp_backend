const productTypeRepository = require('../repositories/productTypeRepository');

class ProductTypeService {
    async getAllProductTypes(filters = {}) {
        return productTypeRepository.findAll(filters);
    }

    async getProductTypeById(id) {
        return productTypeRepository.findById(id);
    }

    async getProductTypeByCode(code) {
        return productTypeRepository.findByCode(code);
    }

    async createProductType(data) {
        // Проверяем уникальность кода
        const exists = await productTypeRepository.existsByCode(data.code);
        if (exists) {
            throw { status: 400, message: `Product type with code "${data.code}" already exists` };
        }

        const id = await productTypeRepository.create(data);
        return this.getProductTypeById(id);
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








