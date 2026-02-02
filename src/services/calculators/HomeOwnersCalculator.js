const knex = require('../../config/database');

class HomeOwnersCalculator {
    /**
     * Calculate premium based on inputs and tariffs
     * @param {Object} params { product_id, object_params: { wall_material: 'wood', ... }, limits: { property: 1000000, civil: 500000 } }
     */
    async calculate(params) {
        const { product_id, object_params, limits } = params;

        // 1. Fetch all tariffs for this product
        const tariffs = await knex('insurance_home_owners_tariffs')
            .where('product_id', product_id);

        if (!tariffs || tariffs.length === 0) {
            throw new Error('No tariffs found for this product');
        }

        // 2. Separate base and multipliers
        const baseRates = tariffs.filter(t => t.coefficient_type === 'base');
        const multipliers = tariffs.filter(t => t.coefficient_type === 'multiplier');

        // 3. Find base rate (e.g., base coefficient per 1 RUB of limit or aggregate base)
        // For simplicity, let's assume base rate is applied to the sum of limits or specific limits
        let totalPremium = 0;
        const appliedSteps = [];

        // Logic: 
        // We might have different base rates for property and civil liability? 
        // User said "don't split", so we calculate a single premium.
        // Let's assume total_limit = property + civil (if provided)
        const propertyLimit = Number(limits?.property || 0);
        const civilLimit = Number(limits?.civil || 0);
        const totalLimit = propertyLimit + civilLimit;

        // Find applicable base rate (e.g. by object_type which is a core param)
        const objectType = object_params.object_type;
        const baseRate = baseRates.find(r => r.parameter_name === 'object_type' && r.parameter_value === objectType)
            || baseRates[0]; // Fallback to first base rate if not found

        if (!baseRate) {
            throw new Error('Base rate not configured for this product');
        }

        // Initial premium = base_coeff * total_limit (or just base_coeff if it's a fixed price)
        // Standard insurance formula: Premium = Limit * Rate
        let currentPremium = totalLimit * Number(baseRate.coefficient);

        appliedSteps.push({
            parameter: 'base_rate',
            value: baseRate.parameter_value,
            coefficient: baseRate.coefficient,
            premium_after: currentPremium
        });

        // 4. Apply multipliers
        for (const [paramName, paramValue] of Object.entries(object_params)) {
            // Skip object_type as it was used for base rate
            if (paramName === 'object_type') continue;

            const multiplier = multipliers.find(m => m.parameter_name === paramName && m.parameter_value === paramValue);
            if (multiplier) {
                const prevPremium = currentPremium;
                currentPremium *= Number(multiplier.coefficient);
                appliedSteps.push({
                    parameter: paramName,
                    value: paramValue,
                    coefficient: multiplier.coefficient,
                    premium_after: currentPremium
                });
            }
        }

        return {
            total_premium: Math.round(currentPremium * 100) / 100,
            total_limit: totalLimit,
            limits: {
                property: propertyLimit,
                civil: civilLimit
            },
            calculation_steps: appliedSteps,
            currency: 'RUB'
        };
    }
}

module.exports = new HomeOwnersCalculator();
