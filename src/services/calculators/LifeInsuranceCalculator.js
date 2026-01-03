const BaseCalculator = require('./BaseCalculator');

class LifeInsuranceCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { client, services } = context;
        const { nsjApiService } = services;

        try {
            const nsjParams = {
                target_amount: goal.target_amount,
                term_months: goal.term_months,
                client: client || {},
                payment_variant: goal.payment_variant || 12,
                program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test'
            };

            let nsjResult;
            try {
                nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
            } catch (apiError) {
                if (goal.is_policymaker) {
                    throw { is_smart_fallback: true };
                }
                throw apiError;
            }

            return {
                goal_id: goal.goal_type_id,
                goal_name: goal.name,
                goal_type: 'LIFE',
                summary: {
                    goal_type: 'LIFE',
                    status: 'OK',
                    initial_capital: 0,
                    monthly_replenishment: Math.round((nsjResult.total_premium || 0) / (nsjResult.term_years ? nsjResult.term_years * 12 : 1)),
                    total_capital_at_end: nsjResult.total_limit || 0,
                    target_achieved: true,
                    projected_value: nsjResult.total_limit || 0,
                    state_benefit: 0
                },
                nsj_calculation: nsjResult
            };
        } catch (error) {
            if (goal.is_policymaker || error.is_smart_fallback) {
                return {
                    goal_id: goal.goal_type_id,
                    goal_name: goal.name,
                    goal_type: 'LIFE',
                    summary: {
                        goal_type: 'LIFE',
                        status: 'OK',
                        initial_capital: 0,
                        monthly_replenishment: Math.round(goal.monthly_replenishment || 0),
                        total_capital_at_end: Math.round(goal.target_amount || 0),
                        target_achieved: true,
                        projected_value: Math.round(goal.target_amount || 0),
                        state_benefit: 0
                    },
                    nsj_calculation: {
                        success: true,
                        warnings: ['Calculated by Smart Engine (Fallback Mode)']
                    }
                };
            }
            throw error;
        }
    }
}

module.exports = new LifeInsuranceCalculator();
