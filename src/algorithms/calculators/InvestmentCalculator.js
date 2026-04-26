const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');

class InvestmentCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { settings, client, repositories } = context;
        const { portfolioRepository, productRepository } = repositories;
        // Рост расходов на инвестиции: в контексте уже месячная доля (из годовой или месячной настройки)
        const replenishmentIndexationDecimal = context.replenishmentIndexationRate ?? ((settings.investment_expense_growth_monthly || 0) / 100);
        const db_inflation_year_percent = settings.inflation_rate_year || 4.0;

        // 0. Найти портфель
        const initialCapitalForSearch = (goal.smart_initial_capital !== undefined)
            ? Number(goal.smart_initial_capital)
            : Number(goal.initial_capital || 0);

        const portfolio = await portfolioRepository.findByCriteria({
            projectId: context.projectId,
            classId: goal.goal_type_id,
            amount: initialCapitalForSearch,
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
        } = await this.calculateWeightedYield(portfolio, goal, productRepository, context.projectId, context);

        const portfolioYieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;

        // 2. Симуляция (по месяцам как в Excel)
        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
        const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;

        // Resolve initial capital (respects reservation)
        const initialCapital = this.resolveInitialCapital(goal, context);
        const { iisEligibleInitialCapital, iisEligibleMonthlyShare } = this.getIisContributionParams(
            goal,
            initial_instruments,
            monthly_instruments,
            initialCapital
        );

        const simResult = await this.runSimulation({
            initialCapital: initialCapital,
            monthlyReplenishment: monthlyReplenishment,
            termMonths: goal.term_months,
            monthlyYieldRate: portfolioYieldMonthly,
            indexationRate: replenishmentIndexationDecimal,
            pdsProductId,
            iisEligibleInitialCapital,
            iisEligibleMonthlyShare,
            avgMonthlyIncome,
            startDate,
            collectMonthlySchedule: true,
            children: context.client?.tax_children || context.client?.family_profile?.children || [],
            childrenDeductionEnabled: Boolean(context.client?.enable_children_tax_deduction)
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
            initial_instruments.push({
                name: `Инструменты портфеля "${portfolio.name}"`,
                share: 100,
                yield: Math.round(weightedYieldAnnual * 100) / 100,
                amount: initialCapital,
                product_type: null,
            });
        }
        if (monthlyReplenishment > 0 && (!monthly_instruments || monthly_instruments.length === 0)) {
            monthly_instruments.push({
                name: `Инструменты портфеля "${portfolio.name}"`,
                share: 100,
                yield: Math.round(weightedYieldAnnual * 100) / 100,
                amount: monthlyReplenishment,
                product_type: null,
            });
        }

        return {
            goal_id: goal.id,
            goal_type_id: 3,
            goal_type: 'INVESTMENT',
            summary: {
                status: 'OK',
                initial_capital: Math.round(initialCapital * 100) / 100,
                monthly_replenishment: Math.round(monthlyReplenishment * 100) / 100,
                target_months: goal.term_months,

                projected_capital_at_end: Math.round(totalCapital * 100) / 100,

                total_tax_benefit: Math.round(simResult.totalTaxRefund * 100) / 100,
                total_cofinancing: Math.round(simResult.totalCofinancing * 100) / 100,

                accumulation_yield_percent: Math.round(weightedYieldAnnual * 100) / 100
            },
            details: {
                portfolio_id: portfolio.id,
                portfolio_name: portfolio.name,
                initial_instruments: initial_instruments,
                monthly_instruments: monthly_instruments,
                yearly_breakdown: simResult.yearlyBreakdown,
                monthly_schedule: simResult.monthlySchedule || []
            }
        };
    }
}

module.exports = new InvestmentCalculator();
