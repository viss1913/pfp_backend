const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');

class InvestmentCalculator extends BaseCalculator {
    async calculate(goal, client, context, settings) {
        const { riskProfiles, m_month_percent, db_inflation_year_percent } = settings;
        const profile = riskProfiles.find(p => p.risk_profile === (goal.risk_profile || 'BALANCED'));

        if (!profile) {
            throw new Error(`Risk profile ${goal.risk_profile} not found`);
        }

        // 1. Определение доходности
        let weightedYieldAnnual = 0;
        let capitalDistribution = profile.instruments ?
            profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL') :
            (profile.initial_capital || []);

        let pdsProductId = null;

        for (const item of capitalDistribution) {
            const product = await productRepository.findById(item.product_id);
            if (!product) continue;

            if (product.product_type === 'PDS') pdsProductId = product.id;

            const allocatedAmount = Math.max((goal.initial_capital || 0) * (item.share_percent / 100), 1);
            const yields = product.yields || [];
            const line = yields.find(l =>
                goal.term_months >= l.term_from_months &&
                goal.term_months <= l.term_to_months &&
                allocatedAmount >= parseFloat(l.amount_from) &&
                allocatedAmount <= parseFloat(l.amount_to)
            ) || yields[0];

            const productYield = line ? parseFloat(line.yield_percent) : 0;
            weightedYieldAnnual += (productYield * (item.share_percent / 100));
        }

        const portfolioYieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;

        // 2. Симуляция
        let currentBalance = goal.initial_capital || 0;
        let totalClientInvestment = goal.initial_capital || 0;
        let totalStateBenefit = 0;

        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
        const startYear = startDate.getFullYear();
        const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;

        const yearlyContributions = {};
        if (goal.initial_capital > 0) {
            yearlyContributions[startYear] = (yearlyContributions[startYear] || 0) + goal.initial_capital;
        }

        let currentDate = new Date(startDate);
        const indexationRate = (m_month_percent || 0.1) / 100;

        for (let m = 0; m < goal.term_months; m++) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;

            // Рост капитала
            currentBalance *= (1 + portfolioYieldMonthly);

            // Пополнение и индексация
            const indexedReplenishment = monthlyReplenishment * Math.pow(1 + indexationRate, m);
            currentBalance += indexedReplenishment;
            totalClientInvestment += indexedReplenishment;
            yearlyContributions[year] = (yearlyContributions[year] || 0) + indexedReplenishment;

            // ПДС события (через базу)
            if (pdsProductId) {
                const benefit = await this.handlePdsEvents(month, year, startYear, yearlyContributions, avgMonthlyIncome, context);
                currentBalance += benefit;
                totalStateBenefit += benefit;
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        const targetAmountFuture = goal.target_amount || 0; // В текущей логике INVESTMENT цель часто без таргета или он информационный
        const totalCapital = currentBalance;

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'INVESTMENT',
            summary: {
                goal_type: 'INVESTMENT',
                status: (totalCapital >= targetAmountFuture * 0.999) ? 'OK' : 'GAP',
                initial_capital: goal.initial_capital || 0,
                monthly_replenishment: monthlyReplenishment,
                total_capital_at_end: Math.round(totalCapital),
                target_achieved: (totalCapital >= targetAmountFuture * 0.999),
                state_benefit: Math.round(totalStateBenefit)
            },
            details: {
                total_investment_income: Math.round(totalCapital - totalClientInvestment - totalStateBenefit),
                total_client_investment: Math.round(totalClientInvestment),
                portfolio_yield_annual: weightedYieldAnnual
            }
        };
    }
}

module.exports = new InvestmentCalculator();
