const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class OtherGoalCalculator extends BaseCalculator {
    async calculate(goal, client, context, settings) {
        const { db_inflation_year_percent, m_month_percent } = settings;

        const termMonths = goal.term_months || 120;
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
        const inflationMonthly = this.getMonthlyInflation(inflationRate);
        const targetAmountFuture = (goal.target_amount || 0) * Math.pow(1 + inflationMonthly, termMonths);

        // Поиск портфеля (ID 4 - Прочее)
        const portfolio = await portfolioRepository.findByCriteria({
            classId: 4,
            amount: goal.initial_capital || 0,
            term: termMonths
        });

        if (!portfolio) throw new Error('Portfolio for OTHER goals not found');

        // Доходность (упрощенно)
        const d_annual = 10; // Default fallback
        const yieldMonthly = this.getMonthlyYield(d_annual);

        const inflowData = this.getGoalInflows(goal, settings.assets, context, termMonths, goal.initial_capital, targetAmountFuture, yieldMonthly, inflationMonthly);

        const recommendedReplenishment = await this.simulateGoal({
            initialCapital: goal.initial_capital || 0,
            targetAmountFuture: targetAmountFuture,
            termMonths: termMonths,
            monthlyYieldRate: yieldMonthly,
            monthlyInflationRate: (m_month_percent || 0.1) / 100,
            inflows: inflowData.allInflows
        });

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'OTHER',
            summary: {
                goal_type: 'OTHER',
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                initial_capital: goal.initial_capital || 0,
                monthly_replenishment: Math.round(recommendedReplenishment),
                total_capital_at_end: Math.round(targetAmountFuture),
                target_achieved: true,
                projected_value: Math.round(targetAmountFuture),
                state_benefit: 0
            }
        };
    }
}

module.exports = new OtherGoalCalculator();
