const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');

class InvestmentCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { settings, client, repositories } = context;
        const { portfolioRepository, productRepository } = repositories;
        const m_month_percent = settings.investment_expense_growth_monthly || 0;
        const db_inflation_year_percent = settings.inflation_rate_year || 4.0;

        // 0. Найти портфель
        const portfolio = await portfolioRepository.findByCriteria({
            classId: goal.goal_type_id,
            amount: goal.initial_capital || 0,
            term: goal.term_months
        });

        if (!portfolio) {
            throw new Error(`Investment portfolio not found for class ${goal.goal_type_id}`);
        }

        const {
            weightedYieldAnnual,
            initial_instruments,
            monthly_instruments,
            pdsProductId
        } = await this.calculateWeightedYield(portfolio, goal, productRepository);

        const portfolioYieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;

        // 2. Симуляция (по месяцам как в Excel)
        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
        const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;

        // DEDUCT FROM POOL
        // Use smart_initial_capital if allocated by CalculationService (Burden-Based), otherwise use input or 0
        let initialCapital = (goal.smart_initial_capital !== undefined) ? goal.smart_initial_capital : (goal.initial_capital || 0);
        initialCapital = this.deductFromSharedPool(initialCapital, context);

        const simResult = await this.runSimulation({
            initialCapital: initialCapital,
            monthlyReplenishment: monthlyReplenishment,
            termMonths: goal.term_months,
            monthlyYieldRate: portfolioYieldMonthly,
            indexationRate: (m_month_percent || 0.1) / 100,
            pdsProductId,
            avgMonthlyIncome,
            startDate
        }, context);

        // ВАЖНО: Обновляем глобальные лимиты ПДС
        if (simResult.usedCofinancingPerYear) context.usedCofinancingPerYear = simResult.usedCofinancingPerYear;
        if (simResult.usedTaxBasePerYear) context.usedTaxBasePerYear = simResult.usedTaxBasePerYear;

        // Update instrument amounts with actual allocations
        if (initial_instruments && initial_instruments.length > 0 && initialCapital > 0) {
            initial_instruments.forEach(inst => {
                inst.amount = initialCapital * (inst.share / 100);
            });
        }
        if (monthly_instruments && monthly_instruments.length > 0 && monthlyReplenishment > 0) {
            monthly_instruments.forEach(inst => {
                inst.amount = monthlyReplenishment * (inst.share / 100);
            });
        }

        const targetAmountFuture = goal.target_amount || 0;
        const totalCapital = simResult.totalCapital;

        // Fallback for instruments if missing (for Consolidated View)
        if (!initial_instruments || initial_instruments.length === 0) {
            initial_instruments.push({ name: `Инструменты портфеля "${portfolio.name}"`, share: 100, yield: Math.round(weightedYieldAnnual * 100) / 100, amount: initialCapital });
        }
        if (monthlyReplenishment > 0 && (!monthly_instruments || monthly_instruments.length === 0)) {
            monthly_instruments.push({ name: `Инструменты портфеля "${portfolio.name}"`, share: 100, yield: Math.round(weightedYieldAnnual * 100) / 100, amount: monthlyReplenishment });
        }

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'INVESTMENT',
            summary: {
                goal_type: 'INVESTMENT',
                status: (totalCapital >= targetAmountFuture * 0.999) ? 'OK' : 'GAP',
                initial_capital: Math.round(initialCapital * 100) / 100,
                monthly_replenishment: Math.round(monthlyReplenishment * 100) / 100,
                total_capital_at_end: Math.round(totalCapital * 100) / 100,
                target_achieved: (totalCapital >= targetAmountFuture * 0.999),
                state_benefit: Math.round(simResult.totalStateBenefit * 100) / 100
            },
            details: {
                portfolio_name: portfolio.name,
                term_months: goal.term_months,
                initial_capital_instruments: initial_instruments,
                monthly_savings_instruments: monthly_instruments,
                total_investment_income: Math.round((totalCapital - simResult.totalClientInvestment - simResult.totalStateBenefit) * 100) / 100,
                total_client_investment: Math.round(simResult.totalClientInvestment * 100) / 100,
                total_cofinancing: Math.round(simResult.totalCofinancing * 100) / 100,
                total_tax_refund: Math.round(simResult.totalTaxRefund * 100) / 100,
                portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100
            }
        };
    }
}

module.exports = new InvestmentCalculator();
