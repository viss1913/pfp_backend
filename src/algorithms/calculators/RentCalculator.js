const BaseCalculator = require('./BaseCalculator');

class RentCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { repositories } = context;
        const { productRepository, portfolioRepository } = repositories;

        // 1. Get Portfolio & Yield
        let portfolio;
        try {
            portfolio = await portfolioRepository.findByCriteria({
                projectId: context.projectId,
                classId: goal.goal_type_id,
                amount: goal.initial_capital || 0,
                term: 12 // Nominal term for searching
            });
        } catch (e) {
            console.warn('Portfolio not found for Rent, using default logic if possible');
        }

        if (!portfolio) {
            throw new Error(`Rent portfolio not found for class ${goal.goal_type_id} and amount ${goal.initial_capital}`);
        }

        const { weightedYieldAnnual } = await this.calculateWeightedYield(portfolio, { ...goal, term_months: 12 }, productRepository, context.projectId);

        // 2. Calculate Monthly Income
        // Use smart_initial_capital if allocated by CalculationService (Burden-Based), otherwise use input or 0
        const initialCapital = (goal.smart_initial_capital !== undefined) ? Number(goal.smart_initial_capital) : Number(goal.initial_capital || 0);

        const monthlyIncomeRent = (initialCapital * (weightedYieldAnnual / 100)) / 12;

        return {
            goal_id: goal.id,
            goal_type_id: 8,
            goal_type: 'RENT',
            summary: {
                status: 'OK',
                initial_capital: Math.round(initialCapital * 100) / 100,

                projected_monthly_income: Math.round(monthlyIncomeRent * 100) / 100,

                payout_yield_percent: Math.round(weightedYieldAnnual * 100) / 100,
                total_tax_benefit: 0
            },
            details: {
                portfolio_id: portfolio.id,
                portfolio_name: portfolio.name,
                instruments: portfolio.instruments || []
            }
        };
    }
}

module.exports = new RentCalculator();
