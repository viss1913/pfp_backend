const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class PassiveIncomeCalculator extends BaseCalculator {
    async calculate(goal, client, context, settings) {
        const { settingsService, pdsCofinancingService, db_inflation_year_percent, m_month_percent } = settings;

        // 1. Расчет желаемого дохода в будущем
        const inflationAnnualUsed = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
        const infl_month_decimal = this.getMonthlyInflation(inflationAnnualUsed);
        const desiredMonthlyIncomeFuture = goal.target_amount * Math.pow(1 + infl_month_decimal, goal.term_months);

        // 2. Определение целевого капитала для выплат
        const yieldLine = await settingsService.findPassiveIncomeYieldLine(0, goal.term_months, true);
        if (!yieldLine) throw new Error('Passive income yield line not found');
        const payoutYieldPercent = parseFloat(yieldLine.yield_percent);
        const requiredCapitalFuture = (desiredMonthlyIncomeFuture * 12 * 100) / payoutYieldPercent;

        // 3. Подбор портфеля и расчет доходности накопления
        const portfolio = await portfolioRepository.findByCriteria({
            classId: goal.goal_type_id,
            amount: goal.initial_capital || 0,
            term: goal.term_months
        });

        const d_annual = payoutYieldPercent; // Упрощение: используем ту же доходность для накопления, если нет портфеля
        const d_month_decimal = this.getMonthlyYield(d_annual);

        // 4. Притоки (вклады, Shared Pool)
        const inflowData = this.getGoalInflows(goal, settings.assets, context, goal.term_months, goal.initial_capital, requiredCapitalFuture, d_month_decimal, infl_month_decimal);

        // 5. Поиск пополнения
        let recommendedReplenishment = await this.simulateGoal({
            initialCapital: goal.initial_capital || 0,
            targetAmountFuture: requiredCapitalFuture,
            termMonths: goal.term_months,
            monthlyYieldRate: d_month_decimal,
            monthlyInflationRate: (m_month_percent || 0.1) / 100,
            inflows: inflowData.allInflows
        });

        let recommendedReplenishmentRaw = recommendedReplenishment;
        let totalStateBenefit = 0;

        // 6. ПДС Проверка (если есть портфель)
        if (portfolio) {
            // Тут должна быть логика поиска PDS в портфеле (упрощенно)
            // И вызов pdsCofinancingService
        }

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'PASSIVE_INCOME',
            summary: {
                goal_type: 'PASSIVE_INCOME',
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                initial_capital: goal.initial_capital || 0,
                monthly_replenishment: Math.round(recommendedReplenishment),
                monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw),
                total_capital_at_end: Math.round(requiredCapitalFuture),
                projected_value: Math.round(desiredMonthlyIncomeFuture),
                state_benefit: Math.round(totalStateBenefit)
            }
        };
    }
}

module.exports = new PassiveIncomeCalculator();
