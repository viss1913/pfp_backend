const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class PassiveIncomeCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { settings, client, repositories, services, assets } = context;
        const { portfolioRepository, productRepository } = repositories;
        const { settingsService } = services;

        // 1. Определение желаемого дохода в будущем (с учетом инфляции)
        const initialDesiredIncome = goal.desired_monthly_income || goal.target_amount || 0;
        const inflationRate = (goal.inflation_rate !== undefined && goal.inflation_rate !== null)
            ? Number(goal.inflation_rate)
            : (settings.inflation_rate_year || 4.0);

        const termMonths = Number(goal.term_months || 120);
        const termYears = termMonths / 12;
        const infl_month_decimal = (inflationRate / 12) / 100;

        // Желаемый доход в ценах БУДУЩЕГО (индексируем на инфляцию за весь срок)
        const desiredIncomeFuture = initialDesiredIncome * Math.pow(1 + (inflationRate / 100), termYears);

        // 2. Resolve Initial Capital (respects reservation)
        const initialCapital = this.resolveInitialCapital(goal, context);

        // 3. Расчет целевого капитала (Фаза выплат)
        // Используем настройки passive_income_yield из админки (12-14%)
        const payoutYieldLine = await settingsService.findPassiveIncomeYieldLine(0, termMonths, true, context.projectId);
        if (!payoutYieldLine) throw new Error('Passive income yield line not found in settings');
        const payoutYieldPercent = parseFloat(payoutYieldLine.yield_percent);

        // Капитал нужен такой, чтобы его доходность покрывала желаемый доход
        // Формула: (Доход * 12 мес * 100) / Процент_доходности
        const requiredCapitalFuture = (desiredIncomeFuture * 12 * 100) / payoutYieldPercent;

        const initialCapitalForSearch = (goal.smart_initial_capital !== undefined) ? Number(goal.smart_initial_capital) : Number(goal.initial_capital || 0);

        // 4. Подбор портфеля и расчет доходности накопления (Фаза накопления)
        const portfolio = await portfolioRepository.findByCriteria({
            projectId: context.projectId,
            classId: goal.goal_type_id,
            amount: initialCapitalForSearch,
            term: termMonths
        });

        if (!portfolio) {
            throw new Error(`Portfolio not found for Passive Income (class ${goal.goal_type_id})`);
        }

        // Используем общую функцию для расчета доходности инструментов и поиска ПДС
        const {
            weightedYieldAnnual,
            initial_instruments,
            monthly_instruments,
            pdsProductId
        } = await this.calculateWeightedYield(portfolio, goal, productRepository, context.projectId);

        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual);

        // 5. Симуляция подбора пополнения
        let recommendedReplenishment = 0;
        let simResult;

        if (goal.monthly_replenishment && goal.monthly_replenishment > 0) {
            // Прямой расчет
            recommendedReplenishment = Number(goal.monthly_replenishment);
            simResult = await this.runSimulation({
                initialCapital,
                monthlyReplenishment: recommendedReplenishment,
                termMonths,
                monthlyYieldRate: yieldMonthly,
                indexationRate: context.replenishmentIndexationRate ?? ((settings.investment_expense_growth_monthly || 0.1) / 100),
                totalTargetAmount: requiredCapitalFuture,
                avgMonthlyIncome: goal.avg_monthly_income || (client && client.avg_monthly_income) || 0,
                pdsProductId
            }, context);
        } else {
            // Обратный расчет (подбор пополнения)
            recommendedReplenishment = await this.simulateGoal({
                targetAmountFuture: requiredCapitalFuture,
                initialCapital,
                termMonths,
                monthlyYieldRate: yieldMonthly,
                indexationRate: context.replenishmentIndexationRate ?? ((settings.investment_expense_growth_monthly || 0.1) / 100),
                pdsProductId,
                avgMonthlyIncome: goal.avg_monthly_income || (client && client.avg_monthly_income) || 0
            }, context);

            simResult = await this.runSimulation({
                initialCapital,
                monthlyReplenishment: recommendedReplenishment,
                termMonths,
                monthlyYieldRate: yieldMonthly,
                indexationRate: context.replenishmentIndexationRate ?? ((settings.investment_expense_growth_monthly || 0.1) / 100),
                totalTargetAmount: requiredCapitalFuture,
                avgMonthlyIncome: goal.avg_monthly_income || (client && client.avg_monthly_income) || 0,
                pdsProductId
            }, context);
        }

        // Обновляем контекст ПДС для следующих целей
        if (simResult.usedCofinancingPerYear) context.usedCofinancingPerYear = simResult.usedCofinancingPerYear;
        if (simResult.usedTaxBasePerYear) context.usedTaxBasePerYear = simResult.usedTaxBasePerYear;

        // 6. Формирование инструментов для вывода
        if (initial_instruments && initial_instruments.length > 0 && initialCapital > 0) {
            initial_instruments.forEach(inst => {
                inst.amount = initialCapital * (inst.share / 100);
            });
        }
        if (monthly_instruments && monthly_instruments.length > 0 && recommendedReplenishment > 0) {
            monthly_instruments.forEach(inst => {
                inst.amount = recommendedReplenishment * (inst.share / 100);
            });
        }

        // 7. Пересчет достижимого дохода при фиксированном пополнении:
        // если пользователь сам задал monthly_replenishment, считаем,
        // какой доход в сегодняшних ценах реально достижим при таком пополнении.
        let effectiveDesiredIncomePresent = initialDesiredIncome;
        if (goal.monthly_replenishment && goal.monthly_replenishment > 0 && simResult && simResult.totalCapital != null) {
            const payoutMonthlyFuture = (simResult.totalCapital * payoutYieldPercent / 100) / 12;
            const discountFactor = Math.pow(1 + (inflationRate / 100), termYears);
            effectiveDesiredIncomePresent = payoutMonthlyFuture / discountFactor;
        }

        return {
            goal_id: goal.id,
            goal_type_id: 2,
            goal_type: 'PASSIVE_INCOME',
            summary: {
                status: (recommendedReplenishment <= ((goal.avg_monthly_income || (client && client.avg_monthly_income) || 0) * 0.2)) ? 'OK' : 'GAP',
                initial_capital: Math.round(initialCapital * 100) / 100,
                monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                target_amount_initial: Math.round(effectiveDesiredIncomePresent * 100) / 100,
                target_amount_future: Math.round(requiredCapitalFuture * 100) / 100,
                target_months: termMonths,
                projected_capital_at_end: Math.round(simResult.totalCapital * 100) / 100,
                required_capital_at_end: Math.round(requiredCapitalFuture * 100) / 100,

                inflation_rate: Math.round(inflationRate * 100) / 100,
                accumulation_yield_percent: Math.round(weightedYieldAnnual * 100) / 100,
                payout_yield_percent: Math.round(payoutYieldPercent * 100) / 100,

                total_tax_benefit: Math.round(simResult.totalTaxRefund * 100) / 100,
                total_cofinancing: Math.round(simResult.totalCofinancing * 100) / 100,

                _debug: {
                    initialCapital,
                    requiredCapitalFuture,
                    termMonths,
                    yieldMonthly,
                    replenishmentResult: recommendedReplenishment,
                    desiredIncomeFuture,
                    pdsProductId
                }
            },
            details: {
                portfolio_id: portfolio.id,
                portfolio_name: portfolio.name,
                initial_instruments: initial_instruments,
                monthly_instruments: monthly_instruments,
                yearly_breakdown: simResult.yearlyBreakdown
            }
        };
    }
}

module.exports = new PassiveIncomeCalculator();
