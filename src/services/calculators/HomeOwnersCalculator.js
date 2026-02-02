const knex = require('../../config/database');

class HomeOwnersCalculator {
    /**
     * Calculate premium based on inputs and tariffs
     * @param {Object} params { product_id, object_params: { wall_material: 'wood', ... }, limits: { property: 1000000, civil: 500000 } }
     */
    async calculate(params) {
        const { product_id, object_params, limits } = params;

        // 1. Fetch product to get base rates
        const product = await knex('insurance_home_owners_products')
            .where('id', product_id)
            .first();

        if (!product) {
            throw new Error('Product not found');
        }

        // 2. Fetch all multipliers (tariffs) for this product
        const multipliers = await knex('insurance_home_owners_tariffs')
            .where('product_id', product_id)
            .where('coefficient_type', 'multiplier');

        const appliedSteps = [];

        // 3. Calculate initial premium based on product rates and limits
        const l = {
            constructive: Number(limits?.constructive || 0),
            finish: Number(limits?.finish || 0),
            property: Number(limits?.property || 0),
            civil: Number(limits?.civil || 0)
        };

        const r = {
            constructive: Number(product.rate_constructive || 0),
            finish: Number(product.rate_finish || 0),
            property: Number(product.rate_property || 0),
            civil: Number(product.rate_civil || 0)
        };

        let currentPremium = (l.constructive * r.constructive) +
            (l.finish * r.finish) +
            (l.property * r.property) +
            (l.civil * r.civil);

        appliedSteps.push({
            parameter: 'base_rates',
            value: 'product_defaults',
            details: {
                constructive: `${l.constructive} * ${r.constructive}`,
                finish: `${l.finish} * ${r.finish}`,
                property: `${l.property} * ${r.property}`,
                civil: `${l.civil} * ${r.civil}`
            },
            premium_after: currentPremium
        });

        // 4. Apply multipliers from tariffs
        for (const [paramName, paramValue] of Object.entries(object_params)) {
            const multiplier = multipliers.find(m => m.parameter_name === paramName && m.parameter_value === paramValue);
            if (multiplier) {
                currentPremium *= Number(multiplier.coefficient);
                appliedSteps.push({
                    parameter: paramName,
                    value: paramValue,
                    coefficient: multiplier.coefficient,
                    premium_after: currentPremium
                });
            }
        }

        const totalLimit = l.constructive + l.finish + l.property + l.civil;

        return {
            total_premium: Math.round(currentPremium * 100) / 100,
            total_limit: totalLimit,
            limits: l,
            calculation_steps: appliedSteps,
            currency: 'RUB'
        };
    }
}

module.exports = new HomeOwnersCalculator();
