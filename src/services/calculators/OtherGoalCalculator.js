const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

class OtherGoalCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { client, settings, repositories, assets } = context;
        const { portfolioRepository } = repositories;

        const termMonths = goal.term_months || 120;
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : (context.inflationYear || 4.0);
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

        const initial_instruments = [];
        const monthly_instruments = [];
        let pdsProductId = null;

        let allBuckets = [];
        if (profile.instruments && profile.instruments.length > 0) {
            allBuckets = profile.instruments;
        } else {
            if (profile.initial_capital) {
                allBuckets.push(...profile.initial_capital.map(i => ({ ...i, bucket_type: 'INITIAL_CAPITAL' })));
            }
            const replenishment = profile.initial_replenishment || profile.top_up || profile.monthly_savings;
            if (replenishment) {
                allBuckets.push(...replenishment.map(i => ({ ...i, bucket_type: 'TOP_UP' })));
            }
        }

        for (const item of allBuckets) {
            const product = await repositories.productRepository.findById(item.product_id);
            if (product) {
                const prodType = (product.product_type || '').toUpperCase().trim();
                const isPds = prodType === 'PDS';
                if (isPds) pdsProductId = product.id;

                const allocatedAmount = Math.max((goal.initial_capital || 0) * (item.share_percent / 100), 1);
                const yields = product.yields || [];
                const line = yields.find(l =>
                    termMonths >= l.term_from_months &&
                    termMonths <= l.term_to_months &&
                    allocatedAmount >= parseFloat(l.amount_from) &&
                    allocatedAmount <= parseFloat(l.amount_to)
                ) || yields[0];

                const productYield = line ? parseFloat(line.yield_percent) : 0;

                const instrumentData = {
                    name: product.name,
                    share: item.share_percent,
                    yield: productYield
                };

                const bType = (item.bucket_type || 'INITIAL_CAPITAL').toUpperCase().trim();
                if (bType === 'INITIAL_CAPITAL') {
                    initial_instruments.push(instrumentData);
                    weightedYieldAnnual += (productYield * (item.share_percent / 100));
                } else if (bType === 'MONTHLY_SAVINGS' || bType === 'TOP_UP') {
                    monthly_instruments.push(instrumentData);
                }
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

        // ВАЖНО: После финального расчета по цели обновляем глобальные лимиты ПДС в контексте
        if (simResult.usedCofinancingPerYear) context.usedCofinancingPerYear = simResult.usedCofinancingPerYear;
        if (simResult.usedTaxBasePerYear) context.usedTaxBasePerYear = simResult.usedTaxBasePerYear;

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'OTHER',
            summary: {
                goal_type: 'OTHER',
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                initial_capital: Math.round((goal.initial_capital || 0) * 100) / 100,
                monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                total_capital_at_end: Math.round(simResult.totalCapital * 100) / 100,
                target_achieved: simResult.totalCapital >= targetAmountFuture * 0.999,
                state_benefit: Math.round(simResult.totalStateBenefit * 100) / 100
            },
            details: {
                portfolio_name: portfolio.name,
                portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100,
                term_months: termMonths,
                target_amount_initial: Math.round((goal.target_amount || 0) * 100) / 100,
                target_amount_future: Math.round(targetAmountFuture * 100) / 100,
                initial_capital_instruments: initial_instruments,
                monthly_savings_instruments: monthly_instruments,
                total_investment_income: Math.round((simResult.totalCapital - simResult.totalClientInvestment - simResult.totalStateBenefit) * 100) / 100,
                total_client_investment: Math.round(simResult.totalClientInvestment * 100) / 100,
                total_cofinancing: Math.round(simResult.totalCofinancing * 100) / 100,
                total_tax_refund: Math.round(simResult.totalTaxRefund * 100) / 100
            }
        };
    }
}

module.exports = new OtherGoalCalculator();
