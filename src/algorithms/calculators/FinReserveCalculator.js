const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

/** @param {Date} d */
function formatScheduleDate(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

class FinReserveCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { settings, repositories } = context;
        const { productRepository, portfolioRepository } = repositories;

        // 1. Get Portfolio & Yield
        let portfolio;
        try {
            portfolio = await portfolioRepository.findByCriteria({
                projectId: context.projectId,
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

        const yieldResult = await this.calculateWeightedYield(portfolio, { ...goal, term_months: 12 }, productRepository, context.projectId);
        const weightedYieldAnnual = yieldResult.weightedYieldAnnual;
        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual);

        // 2. Simulation Parameters
        const termMonths = Number(goal.term_months || 12);

        // Resolve initial capital (respects Smart Allocation reservation)
        let initialCapital = this.resolveInitialCapital(goal, context);

        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const indexationRate = context.replenishmentIndexationRate ?? ((settings.investment_expense_growth_monthly || 0.1) / 100);

        let currentBalance = initialCapital;
        let totalClientInvestment = initialCapital;

        const scheduleStart = goal.start_date ? new Date(goal.start_date) : new Date();
        let currentDate = new Date(scheduleStart);
        currentDate.setMonth(currentDate.getMonth() + 1);
        const monthly_schedule = [];

        // 3. Simulation Loop (12 months)
        for (let m = 1; m <= termMonths; m++) {
            // Growth
            currentBalance *= (1 + yieldMonthly);

            // Replenishment (at end of month, or start of next - aligning with InvestmentCalculator logic)
            // InvestmentCalculator applies growth then adds indexed replenishment
            const indexedReplenishment = monthlyReplenishment * Math.pow(1 + indexationRate, m - 1);
            currentBalance += indexedReplenishment;
            totalClientInvestment += indexedReplenishment;

            monthly_schedule.push({
                date: formatScheduleDate(currentDate),
                replenishment: Math.round(indexedReplenishment * 100) / 100,
                total_capital: Math.round(currentBalance * 100) / 100,
                tax_deduction: 0,
                cofinancing: 0
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
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
                initial_instruments: initial_capital_instruments,
                monthly_instruments: monthly_savings_instruments,
                yearly_breakdown: [], // FinReserve uses simple loop, no breakdown yet
                monthly_schedule
            }
        };
    }
}

module.exports = new FinReserveCalculator();
