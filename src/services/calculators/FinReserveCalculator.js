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
        const termMonths = Number(goal.term_months || 12);
        let initialCapital = Number(goal.initial_capital || 0);

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
        let baseInstruments = [];
        // reusable calculation result from start of method
        if (yieldResult.initial_instruments && yieldResult.initial_instruments.length > 0) {
            baseInstruments = yieldResult.initial_instruments;
        } else if (portfolio.instruments && portfolio.instruments.length > 0) {
            baseInstruments = portfolio.instruments;
        } else {
            // Fallback
            baseInstruments = [{ name: 'Банковский депозит / Накопительный счет', share: 100, yield: Math.round(weightedYieldAnnual * 100) / 100 }];
        }

        const initial_capital_instruments = [];
        if (initialCapital > 0) {
            baseInstruments.forEach(inst => {
                initial_capital_instruments.push({
                    ...inst,
                    amount: initialCapital * (inst.share / 100)
                });
            });
        }

        const monthly_savings_instruments = [];
        if (monthlyReplenishment > 0) {
            baseInstruments.forEach(inst => {
                monthly_savings_instruments.push({
                    ...inst,
                    amount: monthlyReplenishment * (inst.share / 100),
                    payment_frequency: 'monthly'
                });
            });
        }

        return {
            goal_id: goal.id,
            goal_type_id: 7,
            goal_type: 'FIN_RESERVE',
            summary: {
                status: 'OK',
                initial_capital: Math.round(initialCapital * 100) / 100,
                monthly_replenishment: Math.round(monthlyReplenishment * 100) / 100,
                target_amount_initial: Math.round(Number(goal.target_amount || 0) * 100) / 100,
                target_amount_future: Math.round(currentBalance * 100) / 100,
                target_months: termMonths,

                projected_capital_at_end: Math.round(currentBalance * 100) / 100,

                accumulation_yield_percent: Math.round(weightedYieldAnnual * 100) / 100,
                total_tax_benefit: 0 // Usually 0 for Reserve
            },
            details: {
                portfolio_id: portfolio.id,
                portfolio_name: portfolio.name,
                instruments: initial_capital_instruments.length > 0 ? initial_capital_instruments : monthly_savings_instruments
            }
        };
    }
}

module.exports = new FinReserveCalculator();
