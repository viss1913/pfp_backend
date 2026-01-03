const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class OtherGoalCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { client, settings, repositories, assets } = context;
        const { portfolioRepository } = repositories;

        const termMonths = goal.term_months || 120;
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : settings.inflation_rate_year;
        const inflationMonthly = this.getMonthlyInflation(inflationRate);
        const targetAmountFuture = (goal.target_amount || 0) * Math.pow(1 + inflationMonthly, termMonths);

        // Поиск портфеля (ID 4 - Прочее)
        const portfolio = await portfolioRepository.findByCriteria({
            classId: 4,
            amount: goal.initial_capital || 0,
            term: termMonths
        });

        if (!portfolio) throw new Error('Portfolio for OTHER goals not found');

        // Доходность
        let weightedYieldAnnual = 0;
        let riskProfiles = portfolio.risk_profiles;
        if (typeof riskProfiles === 'string') riskProfiles = JSON.parse(riskProfiles);

        const searchProfile = (goal.risk_profile || 'BALANCED').toUpperCase();
        const profile = riskProfiles.find(p => {
            const pType = (p.risk_profile || p.profile_type || '').toUpperCase();
            return pType === searchProfile;
        });

        if (!profile) throw new Error(`Risk profile ${searchProfile} not found`);

        let capitalDistribution = profile.instruments ?
            profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL') :
            (profile.initial_capital || []);

        let pdsProductId = null;
        for (const item of capitalDistribution) {
            const product = await repositories.productRepository.findById(item.product_id);
            if (product) {
                if (product.product_type === 'PDS') pdsProductId = product.id;
                const y = product.yields && product.yields[0] ? product.yields[0].yield_percent : 0;
                weightedYieldAnnual += (y * (item.share_percent / 100));
            }
        }

        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual || 10);
        const indexationRate = (settings.investment_expense_growth_monthly || 0.1) / 100;

        const recommendedReplenishment = await this.simulateGoal({
            initialCapital: goal.initial_capital || 0,
            targetAmountFuture: targetAmountFuture,
            termMonths: termMonths,
            monthlyYieldRate: yieldMonthly,
            indexationRate: indexationRate,
            pdsProductId,
            avgMonthlyIncome: client.avg_monthly_income,
            startDate: new Date()
        }, context);

        const simResult = await this.runSimulation({
            initialCapital: goal.initial_capital || 0,
            monthlyReplenishment: recommendedReplenishment,
            termMonths: termMonths,
            monthlyYieldRate: yieldMonthly,
            indexationRate: indexationRate,
            pdsProductId,
            avgMonthlyIncome: client.avg_monthly_income,
            startDate: new Date()
        }, context);

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'OTHER',
            summary: {
                goal_type: 'OTHER',
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                initial_capital: goal.initial_capital || 0,
                monthly_replenishment: Math.round(recommendedReplenishment),
                total_capital_at_end: Math.round(simResult.totalCapital),
                target_achieved: simResult.totalCapital >= targetAmountFuture * 0.999,
                state_benefit: Math.round(simResult.totalStateBenefit)
            },
            details: {
                total_investment_income: Math.round(simResult.totalCapital - simResult.totalClientInvestment - simResult.totalStateBenefit),
                total_client_investment: Math.round(simResult.totalClientInvestment),
                total_cofinancing: Math.round(simResult.totalCofinancing),
                total_tax_refund: Math.round(simResult.totalTaxRefund),
                target_amount_future: Math.round(targetAmountFuture)
            }
        };
    }
}

module.exports = new OtherGoalCalculator();
