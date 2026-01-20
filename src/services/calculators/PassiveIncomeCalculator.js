const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class PassiveIncomeCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { client, settings, repositories, services, assets } = context;
        const { portfolioRepository } = repositories;
        const { settingsService } = services;

        // 1. Расчет желаемого дохода в будущем
        const inflationAnnualUsed = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : settings.inflation_rate_year;
        const infl_month_decimal = this.getMonthlyInflation(inflationAnnualUsed);

        // Use desired_monthly_income if provided (frontend convention), otherwise target_amount
        const initialDesiredIncome = goal.desired_monthly_income || goal.target_amount || 0;
        const desiredMonthlyIncomeFuture = initialDesiredIncome * Math.pow(1 + infl_month_decimal, goal.term_months);

        // 2. Определение целевого капитала для выплат
        const yieldLine = await settingsService.findPassiveIncomeYieldLine(0, goal.term_months, true);
        if (!yieldLine) throw new Error('Passive income yield line not found');
        const payoutYieldPercent = parseFloat(yieldLine.yield_percent);
        const requiredCapitalFuture = (desiredMonthlyIncomeFuture * 12 * 100) / payoutYieldPercent;

        // DEDUCT FROM POOL
        // Use smart_initial_capital if allocated by CalculationService (Burden-Based), otherwise use input or 0
        let initialCapital = (goal.smart_initial_capital !== undefined) ? goal.smart_initial_capital : (goal.initial_capital || 0);
        initialCapital = this.deductFromSharedPool(initialCapital, context);

        // 3. Подбор портфеля и расчет доходности накопления
        const portfolio = await portfolioRepository.findByCriteria({
            classId: goal.goal_type_id,
            amount: initialCapital, // Use deducted
            term: goal.term_months
        });

        // Determine accumulation yield
        const d_annual = portfolio ? parseFloat(portfolio.yield_percent) : payoutYieldPercentInitial; // Use portfolio yield if available, else payout yield
        const d_month_decimal = this.getMonthlyYield(d_annual);

        // 4. Притоки (вклады, Shared Pool)
        // Note: deductFromSharedPool already updated current poolBalance.
        // getGoalInflows might look at assets for OTHER inflows, but liquid capital is managed by context.poolBalance
        // We pass a placeholder requiredCapitalFuture for now, as it might be calculated later
        const inflowData = this.getGoalInflows(goal, assets, context, goal.term_months, initialCapital, 0, d_month_decimal, infl_month_decimal);

        // 5. Simulation logic
        let recommendedReplenishment = 0;
        let finalSimResult;
        let projectedMonthlyIncomeFuture = desiredMonthlyIncomeFuture; // Default: target is met

        const termMonths = goal.term_months;
        const yieldMonthly = d_month_decimal;
        const indexationRateDecimal = (settings.investment_expense_growth_monthly || 0.1) / 100;

        // DIRECT CALCULATION (Forward) - If monthly_replenishment is provided
        if (goal.monthly_replenishment && goal.monthly_replenishment > 0) {
            recommendedReplenishment = Number(goal.monthly_replenishment);

            // Simulate accumulation with the given replenishment
            finalSimResult = await this.runSimulation({
                initialCapital: initialCapital,
                monthlyReplenishment: recommendedReplenishment,
                termMonths: termMonths,
                monthlyYieldRate: yieldMonthly,
                indexationRate: indexationRateDecimal,
                inflows: inflowData.allInflows,
                totalTargetAmount: 0 // Not relevant for accumulation limit
            }, context);

            // Calculate Resulting Passive Income from the Accumulated Capital
            const payoutYieldLineFinal = await settingsService.findPassiveIncomeYieldLine(0, termMonths, true);
            const payoutYieldPercentFinal = payoutYieldLineFinal ? parseFloat(payoutYieldLineFinal.yield_percent) : 10;

            // Income = Capital * Yield / 12
            projectedMonthlyIncomeFuture = (finalSimResult.totalCapital * payoutYieldPercentFinal) / 100 / 12;

        } else {
            // REVERSE CALCULATION
            recommendedReplenishment = await this.simulateGoal({
                initialCapital: initialCapital,
                targetAmountFuture: requiredCapitalFuture,
                termMonths: goal.term_months,
                monthlyYieldRate: d_month_decimal,
                indexationRate: indexationRateDecimal,
                inflows: inflowData.allInflows
            }, context);

            finalSimResult = await this.runSimulation({
                initialCapital: initialCapital,
                monthlyReplenishment: recommendedReplenishment,
                termMonths: goal.term_months,
                monthlyYieldRate: d_month_decimal,
                indexationRate: indexationRateDecimal,
                inflows: inflowData.allInflows,
                totalTargetAmount: requiredCapitalFuture
            }, context);
        }

        let totalStateBenefit = finalSimResult.totalStateBenefit || 0;

        if (finalSimResult.usedCofinancingPerYear) context.usedCofinancingPerYear = finalSimResult.usedCofinancingPerYear;
        if (finalSimResult.usedTaxBasePerYear) context.usedTaxBasePerYear = finalSimResult.usedTaxBasePerYear;

        // 6. ПДС Проверка (если есть портфель)
        if (portfolio) {
            // Тут должна быть логика поиска PDS в портфеле (упрощенно)
            // И вызов pdsCofinancingService
        }

        return {
            goal_id: goal.id,
            goal_type_id: 2,
            goal_type: 'PASSIVE_INCOME',
            summary: {
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                target_amount_initial: Math.round(initialDesiredIncome * 100) / 100,
                target_amount_future: Math.round(desiredMonthlyIncomeFuture * 100) / 100,
                projected_amount_future: Math.round(projectedMonthlyIncomeFuture * 100) / 100,
                inflation_rate: Math.round(inflationAnnualUsed * 100) / 100,

                initial_capital: Math.round(initialCapital * 100) / 100,
                monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                target_months: goal.term_months,

                required_capital_at_end: Math.round(requiredCapitalFuture * 100) / 100,

                total_tax_benefit: Math.round(totalStateBenefit * 100) / 100, // Logic for benefit calculation needs enabling if portfolio exists
                total_cofinancing: 0, // Placeholder as currently logic is not fully active

                accumulation_yield_percent: Math.round(payoutYieldPercent * 100) / 100, // Using p.y. as d_annual is p.y.
                payout_yield_percent: Math.round(payoutYieldPercent * 100) / 100
            },
            details: {
                portfolio_id: portfolio ? portfolio.id : null,
                portfolio_name: portfolio ? portfolio.name : null,
                portfolio_name: portfolio ? portfolio.name : null,
                instruments: portfolio ? (portfolio.instruments || []) : [],
                yearly_breakdown: finalSimResult.yearlyBreakdown
            }
        };
    }
}

module.exports = new PassiveIncomeCalculator();
