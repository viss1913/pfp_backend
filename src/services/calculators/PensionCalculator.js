const BaseCalculator = require('./BaseCalculator');
const productRepository = require('../../repositories/productRepository');
const portfolioRepository = require('../../repositories/portfolioRepository');

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

    async calculate(goal, client, context, settings) {
        if (!client.birth_date) {
            throw new Error('Client birth_date is required for pension calculation');
        }

        const pensionSettings = {
            pension_pfr_contribution_rate_part1: settings.pension_pfr_contribution_rate_part1 || 22,
            pension_fixed_payment: settings.pension_fixed_payment || 8907,
            pension_point_cost: settings.pension_point_cost || 145.69,
            pension_max_salary_limit: settings.pension_max_salary_limit || 2759000,
            pension_ipk_past_coef: settings.pension_ipk_past_coef || 0.6,
            inflation_rate: goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : settings.db_inflation_year_percent
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

        // Фаза накопления (Accumulation Phase)
        const payoutYieldLine = await settings.settingsService.findPassiveIncomeYieldLine(0, monthsToPension, true);
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
        const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile || p.risk_profile === goal.risk_profile);

        // Доходность портфеля
        let weightedYieldAnnual = 0;
        let capitalDistribution = profile.instruments ?
            profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL') :
            (profile.initial_capital || []);

        let pdsProductId = null;
        for (const item of capitalDistribution) {
            const product = await productRepository.findById(item.product_id);
            if (product && product.product_type === 'PDS') pdsProductId = product.id;
            // Упрощенно берем среднюю доходность продукта (в реальности надо по лоту, но тут для краткости)
            const y = product.yields && product.yields[0] ? product.yields[0].yield_percent : 0;
            weightedYieldAnnual += (y * (item.share_percent / 100));
        }

        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const inflowData = this.getGoalInflows(goal, settings.assets, context, monthsToPension, goal.initial_capital, requiredCapitalFuture, yieldMonthly, infl_month_decimal);

        const recommendedReplenishment = await this.simulateGoal({
            initialCapital: goal.initial_capital || 0,
            targetAmountFuture: requiredCapitalFuture,
            termMonths: monthsToPension,
            monthlyYieldRate: yieldMonthly,
            monthlyInflationRate: (settings.m_month_percent || 0.1) / 100,
            inflows: inflowData.allInflows
        });

        return {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'PENSION',
            summary: {
                goal_type: 'PENSION',
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                recommended_replenishment: Math.round(recommendedReplenishment),
                target_amount_future: Math.round(requiredCapitalFuture),
                state_benefit: 0 // Will be populated in loop simulation if needed
            },
            state_pension: statePensionResult,
            pension_gap: {
                gap_monthly_future: Math.round(pensionGapMonthlyFuture),
                has_gap: true
            }
        };
    }
}

module.exports = new PensionCalculator();
