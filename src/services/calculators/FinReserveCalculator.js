const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class FinReserveCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { settings, repositories } = context;
        const { productRepository, portfolioRepository } = repositories;

        // 1. Get Portfolio & Yield
        let portfolio;
        try {
            portfolio = await portfolioRepository.findByCriteria({
                classId: goal.goal_type_id,
                amount: goal.initial_capital || 0,
                term: 12 // Fixed term for FinReserve
            });
        } catch (e) {
            console.warn('Portfolio not found for FinReserve, using default yield logic if possible or throwing error');
        }

        if (!portfolio) {
            throw new Error(`FinReserve portfolio not found for class ${goal.goal_type_id} and amount ${goal.initial_capital}`);
        }

        const yieldResult = await this.calculateWeightedYield(portfolio, { ...goal, term_months: 12 }, productRepository);
        const weightedYieldAnnual = yieldResult.weightedYieldAnnual;
        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual);

        // 2. Simulation Parameters
        const termMonths = 12;
        let initialCapital = goal.initial_capital || 0;

        // DEDUCT FROM POOL: FinReserve consumes liquid capital first!
        // We try to take the full requested amount.
        const deducted = this.deductFromSharedPool(initialCapital, context);

        // If we couldn't deduct the full amount (pool empty), we limit the initial capital to what we got?
        // OR we assume the user might have other sources? 
        // Logic: if user specified initial_capital, we expect it to come from assets. 
        // If assets are insufficient, we start with what we have.
        initialCapital = deducted;

        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const indexationRate = (settings.investment_expense_growth_monthly || 0.1) / 100;

        let currentBalance = initialCapital;
        let totalClientInvestment = initialCapital;

        // 3. Simulation Loop (12 months)
        for (let m = 1; m <= termMonths; m++) {
            // Growth
            currentBalance *= (1 + yieldMonthly);

            // Replenishment (at end of month, or start of next - aligning with InvestmentCalculator logic)
            // InvestmentCalculator applies growth then adds indexed replenishment
            const indexedReplenishment = monthlyReplenishment * Math.pow(1 + indexationRate, m - 1);
            currentBalance += indexedReplenishment;
            totalClientInvestment += indexedReplenishment;
        }

        // Ensure instruments exist for Consolidated Portfolio
        let instruments = [];
        // reusable calculation result from start of method
        if (yieldResult.initial_instruments && yieldResult.initial_instruments.length > 0) {
            instruments = yieldResult.initial_instruments;
        } else if (portfolio.instruments && portfolio.instruments.length > 0) {
            instruments = portfolio.instruments;
        } else {
            // Fallback
            instruments = [{ name: 'Банковский депозит / Накопительный счет', share: 100, yield: Math.round(weightedYieldAnnual * 100) / 100 }];
        }

        if (instruments && instruments.length > 0 && initialCapital > 0) {
            instruments.forEach(inst => {
                inst.amount = initialCapital * (inst.share / 100);
            });
        }

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'FIN_RESERVE',
            summary: {
                goal_type: 'FIN_RESERVE',
                status: 'OK',
                initial_capital: Math.round(initialCapital * 100) / 100,
                monthly_replenishment: Math.round(monthlyReplenishment * 100) / 100,
                total_capital_at_end: Math.round(currentBalance * 100) / 100,
                target_achieved: true,
                projected_value: Math.round(currentBalance * 100) / 100,
                state_benefit: 0
            },
            details: {
                term_months: termMonths,
                target_amount_initial: initialCapital, // It's usually small, match initial
                target_amount_future: Math.round(currentBalance), // For reserve, target is what we grew to? Or user goal? User goal is usually defined by "expenses * months".
                inflation_rate: Math.round((goal.inflation_rate || 0) * 100) / 100, // Pass through
                target_capital_required: Math.round(currentBalance),
                yield_percent: weightedYieldAnnual,
                portfolio: {
                    id: portfolio.id,
                    name: portfolio.name,
                    instruments: instruments
                }
            }
        };
    }
}

module.exports = new FinReserveCalculator();
