const BaseCalculator = require('./BaseCalculator');

class RentCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { repositories } = context;
        const { productRepository, portfolioRepository } = repositories;

        // 1. Get Portfolio & Yield
        let portfolio;
        try {
            portfolio = await portfolioRepository.findByCriteria({
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

        const { weightedYieldAnnual } = await this.calculateWeightedYield(portfolio, { ...goal, term_months: 12 }, productRepository);

        // 2. Calculate Monthly Income
        const initialCapital = goal.initial_capital || 0;
        const monthlyIncomeRent = (initialCapital * (weightedYieldAnnual / 100)) / 12;

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'RENT',
            summary: {
                goal_type: 'RENT',
                status: 'OK',
                initial_capital: Math.round(initialCapital * 100) / 100,
                monthlyIncomeRent: Math.round(monthlyIncomeRent * 100) / 100,
                portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100,
                // Rent assumes capital is preserved or just generating income, so total capital remains?
                // Or should we return initial capital as total? Let's return initial.
                total_capital_at_end: Math.round(initialCapital * 100) / 100,
                state_benefit: 0
            }
        };
    }
}

module.exports = new RentCalculator();
