const BaseCalculator = require('./BaseCalculator');

class PensionCalculator extends BaseCalculator {
    /**
     * Рассчитать прогнозную государственную пенсию
     */
    async calculateStatePension(client, systemSettings, nowDate) {
        const currentYear = nowDate.getFullYear();
        const birthDate = new Date(client.birth_date);
        const birthYear = birthDate.getFullYear();
        const age = currentYear - birthYear;
        const yearsOfWork = Math.max(age - 18, 0);

        const sex = client.sex || '';
        const isMale = sex === 'male' || sex === 'M' || sex === 'мужской';
        const retirementAge = isMale ? 65 : 60;
        const retirementYear = birthYear + retirementAge;
        const yearsToPension = Math.max(retirementYear - currentYear, 0);

        const avgMonthlyIncome = client.avg_monthly_income || 0;
        const incomeAnnual = avgMonthlyIncome * 12;
        const pensionMaxSalaryLimit = systemSettings.pension_max_salary_limit || 2759000;
        const pensionPfrContributionRatePart1 = systemSettings.pension_pfr_contribution_rate_part1 || 22;

        const baseUsed = Math.min(incomeAnnual, pensionMaxSalaryLimit);
        const contribs = baseUsed * (pensionPfrContributionRatePart1 / 100);
        const maxContribs = pensionMaxSalaryLimit * (pensionPfrContributionRatePart1 / 100);

        let ipkYearNow = 0;
        if (maxContribs > 0) {
            ipkYearNow = Math.max(0, Math.min(10, 10 * (contribs / maxContribs)));
        }

        let ipkSoFar = 0;
        if (client.ipk_current !== null && client.ipk_current !== undefined) {
            ipkSoFar = Number(client.ipk_current);
        } else {
            const pensionIpkPastCoef = systemSettings.pension_ipk_past_coef || 0.6;
            ipkSoFar = (ipkYearNow * pensionIpkPastCoef) * yearsOfWork;
        }

        const ipkFuture = ipkYearNow * yearsToPension;
        const ipkEst = ipkSoFar + ipkFuture;

        const inflationRate = systemSettings.inflation_rate || 4.0;
        const pensionPointCost = systemSettings.pension_point_cost || 145.69;
        const pensionFixedPayment = systemSettings.pension_fixed_payment || 8907;

        const pensionPointCostFuture = pensionPointCost * Math.pow(1 + (inflationRate / 100), yearsToPension);
        const pensionFixedPaymentFuture = pensionFixedPayment * Math.pow(1 + (inflationRate / 100), yearsToPension);

        const statePensionMonthlyFuture = ipkEst * pensionPointCostFuture + pensionFixedPaymentFuture;

        return {
            ipk_est: Math.round(ipkEst * 100) / 100,
            state_pension_monthly_future: Math.round(statePensionMonthlyFuture * 100) / 100,
            state_pension_monthly_current: Math.round(statePensionMonthlyFuture / Math.pow(1 + (inflationRate / 100), yearsToPension) * 100) / 100,
            retirement_age: retirementAge,
            retirement_year: retirementYear,
            years_to_pension: yearsToPension,
            years_of_work: yearsOfWork,
            age: age
        };
    }

    async calculate(goal, context) {
        const { client, settings, repositories } = context;
        const { portfolioRepository, productRepository } = repositories;

        if (!client.birth_date) {
            throw new Error('Client birth_date is required for pension calculation');
        }

        const pensionSettings = {
            pension_pfr_contribution_rate_part1: settings.pension_pfr_contribution_rate_part1 || 22,
            pension_fixed_payment: settings.pension_fixed_payment || 8907,
            pension_point_cost: settings.pension_point_cost || 145.69,
            pension_max_salary_limit: settings.pension_max_salary_limit || 2759000,
            pension_ipk_past_coef: settings.pension_ipk_past_coef || 0.6,
            inflation_rate: goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : settings.inflation_rate_year
        };

        const clientWithIncome = {
            ...client,
            avg_monthly_income: client.avg_monthly_income || goal.avg_monthly_income || 0
        };

        const statePensionResult = await this.calculateStatePension(clientWithIncome, pensionSettings, new Date());

        const inflationAnnualUsed = pensionSettings.inflation_rate;
        const infl_month_decimal = this.getMonthlyInflation(inflationAnnualUsed);
        const monthsToPension = statePensionResult.years_to_pension * 12;
        const desiredPensionMonthlyFuture = goal.target_amount * Math.pow(1 + infl_month_decimal, monthsToPension);
        const pensionGapMonthlyFuture = Math.max(desiredPensionMonthlyFuture - statePensionResult.state_pension_monthly_future, 0);

        if (pensionGapMonthlyFuture <= 0) {
            return {
                goal_id: goal.goal_type_id,
                goal_name: goal.name,
                goal_type: 'PENSION',
                state_pension: statePensionResult,
                desired_pension: {
                    desired_monthly_income_initial: Math.round(goal.target_amount),
                    desired_monthly_income_with_inflation: Math.round(desiredPensionMonthlyFuture)
                },
                pension_gap: { gap_monthly_future: 0, has_gap: false },
                message: 'Госпенсия покрывает желаемую пенсию'
            };
        }

        // Фаза накопления
        const payoutYieldLine = await context.services.settingsService.findPassiveIncomeYieldLine(0, monthsToPension, true);
        if (!payoutYieldLine) throw new Error('Passive income yield line not found');
        const payoutYieldPercent = parseFloat(payoutYieldLine.yield_percent);
        const requiredCapitalFuture = (pensionGapMonthlyFuture * 12 * 100) / payoutYieldPercent;

        // Поиск портфеля для накопления
        const portfolioForAcc = await portfolioRepository.findByCriteria({
            classId: 1,
            amount: goal.initial_capital || 0,
            term: monthsToPension
        });
        if (!portfolioForAcc) throw new Error('Pension portfolio not found');

        let riskProfiles = portfolioForAcc.risk_profiles;
        if (typeof riskProfiles === 'string') riskProfiles = JSON.parse(riskProfiles);

        const searchProfile = (goal.risk_profile || 'BALANCED').toUpperCase();
        const profile = riskProfiles.find(p => {
            const pType = (p.risk_profile || p.profile_type || '').toUpperCase();
            return pType === searchProfile;
        });

        if (!profile) throw new Error(`Pension risk profile ${searchProfile} not found`);

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
            const product = await productRepository.findById(item.product_id);
            if (product) {
                const prodType = (product.product_type || '').toUpperCase().trim();
                const isPds = prodType === 'PDS';
                if (isPds) pdsProductId = product.id;

                const allocatedAmount = Math.max((goal.initial_capital || 0) * (item.share_percent / 100), 1);
                const yields = product.yields || [];
                const line = yields.find(l =>
                    monthsToPension >= l.term_from_months &&
                    monthsToPension <= l.term_to_months &&
                    allocatedAmount >= parseFloat(l.amount_from) &&
                    allocatedAmount <= parseFloat(l.amount_to)
                ) || yields[0];

                const productYield = line ? parseFloat(line.yield_percent) : (product.yields?.[0]?.yield_percent || 0);

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

        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const indexationRateDecimal = (settings.investment_expense_growth_monthly || 0.1) / 100;

        const recommendedReplenishment = await this.simulateGoal({
            initialCapital: goal.initial_capital || 0,
            targetAmountFuture: requiredCapitalFuture,
            termMonths: monthsToPension,
            monthlyYieldRate: yieldMonthly,
            indexationRate: indexationRateDecimal,
            pdsProductId,
            avgMonthlyIncome: clientWithIncome.avg_monthly_income,
            startDate: new Date()
        }, context);

        const simResult = await this.runSimulation({
            initialCapital: goal.initial_capital || 0,
            monthlyReplenishment: recommendedReplenishment,
            termMonths: monthsToPension,
            monthlyYieldRate: yieldMonthly,
            indexationRate: indexationRateDecimal,
            pdsProductId,
            avgMonthlyIncome: client.avg_monthly_income,
            startDate: new Date()
        }, context);

        // ВАЖНО: Обновляем глобальные лимиты ПДС
        if (simResult.usedCofinancingPerYear) context.usedCofinancingPerYear = simResult.usedCofinancingPerYear;
        if (simResult.usedTaxBasePerYear) context.usedTaxBasePerYear = simResult.usedTaxBasePerYear;

        const pensionFromCapitalMonthly = (simResult.totalCapital * (payoutYieldPercent / 100)) / 12;

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'PENSION',
            summary: {
                goal_type: 'PENSION',
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                initial_capital: goal.initial_capital || 0,
                monthly_replenishment: Math.round(recommendedReplenishment),
                total_capital_at_end: Math.round(simResult.totalCapital),
                target_achieved: simResult.totalCapital >= requiredCapitalFuture * 0.999,
                state_benefit: Math.round(simResult.totalStateBenefit)
            },
            details: {
                portfolio_name: portfolioForAcc.name,
                term_months: monthsToPension,
                initial_capital_instruments: initial_instruments,
                monthly_savings_instruments: monthly_instruments,
                state_pension_monthly: Math.round(statePensionResult.state_pension_monthly_current),
                pension_from_capital_monthly: Math.round(pensionFromCapitalMonthly),
                total_pension_monthly: Math.round(statePensionResult.state_pension_monthly_current + pensionFromCapitalMonthly),
                target_amount_initial: Math.round(goal.target_amount || 0),
                target_amount_future: Math.round(requiredCapitalFuture),
                total_client_investment: Math.round(simResult.totalClientInvestment),
                total_cofinancing: Math.round(simResult.totalCofinancing),
                total_tax_refund: Math.round(simResult.totalTaxRefund),
                years_to_pension: statePensionResult.years_to_pension
            }
        };
    }
}

module.exports = new PensionCalculator();
