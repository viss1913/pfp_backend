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

        let riskProfiles = portfolio.risk_profiles;
        if (typeof riskProfiles === 'string') riskProfiles = JSON.parse(riskProfiles);

        const searchProfile = (goal.risk_profile || 'BALANCED').toUpperCase();
        const profile = riskProfiles.find(p => {
            const pType = (p.risk_profile || p.profile_type || '').toUpperCase();
            return pType === searchProfile;
        });

        if (!profile) {
            throw new Error(`Risk profile ${searchProfile} not found in portfolio`);
        }

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
            if (profile.monthly_savings) {
                allBuckets.push(...profile.monthly_savings.map(i => ({ ...i, bucket_type: 'MONTHLY_SAVINGS' })));
            }
        }

        for (const item of allBuckets) {
            const product = await productRepository.findById(item.product_id);
            if (!product) continue;

            const prodType = (product.product_type || '').toUpperCase().trim();
            const isPds = prodType === 'PDS';
            if (isPds) pdsProductId = product.id;

            const allocatedAmount = Math.max((goal.initial_capital || 0) * (item.share_percent / 100), 1);
            const yields = product.yields || [];
            const line = yields.find(l =>
                goal.term_months >= l.term_from_months &&
                goal.term_months <= l.term_to_months &&
                allocatedAmount >= parseFloat(l.amount_from) &&
                allocatedAmount <= parseFloat(l.amount_to)
            ) || yields[0];

            const productYield = line ? parseFloat(line.yield_percent) : 0;

            const instrumentData = {
                name: product.name,
                share: item.share_percent,
                yield: productYield
            };

            const bType = (item.bucket_type || 'INITIAL_CAPITAL').toUpperCase();
            if (bType === 'INITIAL_CAPITAL') {
                initial_instruments.push(instrumentData);
                weightedYieldAnnual += (productYield * (item.share_percent / 100));
            } else if (bType === 'MONTHLY_SAVINGS') {
                monthly_instruments.push(instrumentData);
            }
        }

        const portfolioYieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;

        // 2. Симуляция (по месяцам как в Excel)
        const monthlyReplenishment = goal.monthly_replenishment || 0;
        const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
        const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;

        const simResult = await this.runSimulation({
            initialCapital: goal.initial_capital || 0,
            monthlyReplenishment: monthlyReplenishment,
            termMonths: goal.term_months,
            monthlyYieldRate: portfolioYieldMonthly,
            indexationRate: (m_month_percent || 0.1) / 100,
            pdsProductId,
            avgMonthlyIncome,
            startDate
        }, context);

        const targetAmountFuture = goal.target_amount || 0;
        const totalCapital = simResult.totalCapital;

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
                state_benefit: Math.round(simResult.totalStateBenefit)
            },
            details: {
                portfolio_name: portfolio.name,
                term_months: goal.term_months,
                initial_capital_instruments: initial_instruments,
                monthly_savings_instruments: monthly_instruments,
                total_investment_income: Math.round(totalCapital - simResult.totalClientInvestment - simResult.totalStateBenefit),
                total_client_investment: Math.round(simResult.totalClientInvestment),
                total_cofinancing: Math.round(simResult.totalCofinancing),
                total_tax_refund: Math.round(simResult.totalTaxRefund),
                portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100
            }
        };
    }
}

module.exports = new InvestmentCalculator();
