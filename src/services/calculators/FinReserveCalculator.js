const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class FinReserveCalculator extends BaseCalculator {
    async calculate(goal, client, context, settings) {
        const { m_month_percent, db_inflation_year_percent } = settings;

        const termMonths = goal.term_months || 6; // Финрезерв обычно на полгода
        const yieldMonthly = this.getMonthlyYield(6); // Упрощенная доходность 6%

        let currentBalance = goal.initial_capital || 0;
        let totalClientInvestment = currentBalance;
        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const indexationRate = (m_month_percent || 0.1) / 100;

        for (let m = 0; m < termMonths; m++) {
            currentBalance *= (1 + yieldMonthly);
            const indexedReplenishment = monthlyReplenishment * Math.pow(1 + indexationRate, m);
            currentBalance += indexedReplenishment;
            totalClientInvestment += indexedReplenishment;
        }

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'FIN_RESERVE',
            summary: {
                goal_type: 'FIN_RESERVE',
                status: 'OK',
                initial_capital: goal.initial_capital || 0,
                monthly_replenishment: monthlyReplenishment,
                total_capital_at_end: Math.round(currentBalance),
                target_achieved: true,
                projected_value: Math.round(currentBalance),
                state_benefit: 0
            }
        };
    }
}

module.exports = new FinReserveCalculator();
