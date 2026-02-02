const knex = require('../config/database');

class HomeOwnersService {
    /**
     * Get all home owners insurance products
     */
    async getProducts() {
        return knex('insurance_home_owners_products')
            .where('is_active', true)
            .select('*');
    }

    /**
     * Get product by ID with its tariffs
     */
    async getProductDetails(productId) {
        const product = await knex('insurance_home_owners_products')
            .where('id', productId)
            .first();

        if (!product) return null;

        const tariffs = await knex('insurance_home_owners_tariffs')
            .where('product_id', productId)
            .select('*');

        return { ...product, tariffs };
    }

    /**
     * Get options for UI (Dropdowns)
     */
    async getOptions(productId) {
        const tariffs = await knex('insurance_home_owners_tariffs')
            .where('product_id', productId)
            .select('parameter_name', 'parameter_value', 'label', 'coefficient_type');

        const options = {};
        tariffs.forEach(t => {
            if (!options[t.parameter_name]) {
                options[t.parameter_name] = [];
            }
            options[t.parameter_name].push({
                value: t.parameter_value,
                label: t.label || t.parameter_value
            });
        });

        return options;
    }

    /**
     * Admin: Create or update product
     */
    async upsertProduct(data) {
        const { id, name, description, is_active } = data;
        if (id) {
            await knex('insurance_home_owners_products')
                .where('id', id)
                .update({ name, description, is_active, updated_at: knex.fn.now() });
            return id;
        } else {
            const [newId] = await knex('insurance_home_owners_products')
                .insert({ name, description, is_active });
            return newId;
        }
    }

    /**
     * Admin: Set/Update tariff
     */
    async upsertTariff(data) {
        const { id, product_id, parameter_name, parameter_value, coefficient, label, coefficient_type } = data;
        if (id) {
            await knex('insurance_home_owners_tariffs')
                .where('id', id)
                .update({ parameter_name, parameter_value, coefficient, label, coefficient_type, updated_at: knex.fn.now() });
            return id;
        } else {
            const [newId] = await knex('insurance_home_owners_tariffs')
                .insert({ product_id, parameter_name, parameter_value, coefficient, label, coefficient_type });
            return newId;
        }
    }

    /**
     * Save calculation result
     */
    async saveCalculation(data) {
        const { agent_id, client_id, product_id, input_params, result_data } = data;
        return knex('insurance_home_owners_calculations').insert({
            agent_id,
            client_id,
            product_id,
            input_params: JSON.stringify(input_params),
            result_data: JSON.stringify(result_data)
        });
    }

    /**
     * Get calculation history for agent/client
     */
    async getHistory(agentId, clientId = null) {
        let query = knex('insurance_home_owners_calculations as c')
            .join('insurance_home_owners_products as p', 'c.product_id', 'p.id')
            .where('c.agent_id', agentId)
            .select('c.*', 'p.name as product_name')
            .orderBy('c.created_at', 'desc');

        if (clientId) {
            query = query.where('c.client_id', clientId);
        }

        const history = await query;
        return history.map(h => ({
            ...h,
            input_params: typeof h.input_params === 'string' ? JSON.parse(h.input_params) : h.input_params,
            result_data: typeof h.result_data === 'string' ? JSON.parse(h.result_data) : h.result_data
        }));
    }
}

module.exports = new HomeOwnersService();
