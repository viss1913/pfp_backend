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

        const sex = client.gender || client.sex || '';
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
        if (client.ipk_current !== null && client.ipk_current !== undefined && Number(client.ipk_current) > 0) {
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
            ipk_total: Math.round(ipkEst * 100) / 100,
            ipk_current: Math.round(ipkSoFar * 100) / 100,
            ipk_forecast: Math.round(ipkFuture * 100) / 100,
            point_cost_today: pensionPointCost,
            point_cost_future: Math.round(pensionPointCostFuture * 100) / 100,
            fixed_payment_today: pensionFixedPayment,
            fixed_payment_future: Math.round(pensionFixedPaymentFuture * 100) / 100,
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

        const inflationRate = (goal.inflation_rate !== undefined && goal.inflation_rate !== null)
            ? Number(goal.inflation_rate)
            : (settings.inflation_rate_year || context.inflationYear || 4.0);

        const pensionSettings = {
            pension_pfr_contribution_rate_part1: settings.pension_pfr_contribution_rate_part1 || 22,
            pension_fixed_payment: settings.pension_fixed_payment || 8907,
            pension_point_cost: settings.pension_point_cost || 145.69,
            pension_max_salary_limit: settings.pension_max_salary_limit || 2759000,
            pension_ipk_past_coef: settings.pension_ipk_past_coef || 0.6,
            inflation_rate: inflationRate
        };

        const clientWithIncome = {
            ...client,
            avg_monthly_income: client.avg_monthly_income || goal.avg_monthly_income || 0,
            ipk_current: goal.ipk_current !== undefined ? goal.ipk_current : (client.ipk_current || 0),
            ops_capital: goal.ops_capital !== undefined ? goal.ops_capital : (client.ops_capital || 0)
        };

        const statePensionResult = await this.calculateStatePension(clientWithIncome, pensionSettings, new Date());

        // DEDUCT FROM POOL
        // Use resolveInitialCapital to respect Smart Allocation reservation and avoid double-deducting
        let initialCapital = this.resolveInitialCapital(goal, context);

        // ADD OPS CAPITAL (накопительная часть пенсии, которую можно инвестировать)
        const opsCapital = goal.ops_capital || clientWithIncome.ops_capital || 0;
        initialCapital += opsCapital;

        const inflationAnnualUsed = pensionSettings.inflation_rate;
        const infl_month_decimal = (inflationAnnualUsed / 12) / 100; // Correct monthly decimal
        const monthsToPension = statePensionResult.years_to_pension * 12;

        // Желаемая пенсия в ценах БУДУЩЕГО (индексируем на инфляцию за весь срок)
        const desiredPensionMonthlyFuture = (goal.target_amount || 0) * Math.pow(1 + (inflationAnnualUsed / 100), statePensionResult.years_to_pension);
        const pensionGapMonthlyFuture = Math.max(desiredPensionMonthlyFuture - statePensionResult.state_pension_monthly_future, 0);

        // Фаза накопления
        const payoutYieldLine = await context.services.settingsService.findPassiveIncomeYieldLine(0, monthsToPension, true, context.projectId);
        if (!payoutYieldLine) throw new Error('Passive income yield line not found');
        const payoutYieldPercent = parseFloat(payoutYieldLine.yield_percent);
        // Капитал нужен такой, чтобы его доходность (passive yield) покрывала нехватку
        const requiredCapitalFuture = (pensionGapMonthlyFuture * 12 * 100) / payoutYieldPercent;

        // Поиск портфеля для накопления
        const portfolioForAcc = await portfolioRepository.findByCriteria({
            projectId: context.projectId,
            classId: 1,
            amount: initialCapital, // Use deducted capital
            term: monthsToPension
        });
        if (!portfolioForAcc) throw new Error('Pension portfolio not found');

        let riskProfiles = portfolioForAcc.riskProfiles || portfolioForAcc.risk_profiles || [];

        if (typeof riskProfiles === 'string') {
            try {
                riskProfiles = JSON.parse(riskProfiles);
            } catch (e) {
                // ignore
            }
        }

        if (!Array.isArray(riskProfiles)) {
            console.error('CRITICAL ERROR: riskProfiles is not an array in PensionCalculator!');
            console.error('Portfolio ID:', portfolioForAcc.id);
            throw new Error(`Invalid riskProfiles format for portfolio ${portfolioForAcc.id}`);
        }

        if (riskProfiles.length === 0) {
            throw new Error('No risk profiles found for pension portfolio');
        }

        const searchProfile = (goal.risk_profile || 'BALANCED').toUpperCase();
        const profile = riskProfiles.find(p => {
            const pType = (p.risk_profile || p.profile_type || '').toUpperCase();
            return pType === searchProfile;
        });

        if (!profile) throw new Error(`Pension risk profile ${searchProfile} not found`);

        const initial_instruments = [];
        const monthly_instruments = [];
        let pdsProductId = null;
        let weightedYieldAnnual = 0;

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
            const product = await productRepository.findById(item.product_id, context.projectId);
            if (product) {
                const prodType = (product.product_type || '').toUpperCase().trim();
                const isPds = prodType === 'PDS';
                if (isPds) pdsProductId = product.id;

                const allocatedAmount = Math.max(initialCapital * (item.share_percent / 100), 1);
                const yields = product.yields || [];
                const line = yields.find(l =>
                    monthsToPension >= l.term_from_months &&
                    monthsToPension <= l.term_to_months &&
                    allocatedAmount >= parseFloat(l.amount_from) &&
                    allocatedAmount <= parseFloat(l.amount_to)
                ) || yields[0];

                const productYield = line ? parseFloat(line.yield_percent) : (product.yields?.[0]?.yield_percent || 0);

                // Short-term yield: ищем доходность с минимальным сроком для ЭТОЙ суммы
                const matchingAmountRowsP = yields.filter(l =>
                    allocatedAmount >= parseFloat(l.amount_from) &&
                    allocatedAmount <= parseFloat(l.amount_to)
                );
                const shortTermLineP = matchingAmountRowsP.length > 0
                    ? matchingAmountRowsP.reduce((min, l) =>
                        (parseFloat(l.term_to_months) || 999) < (parseFloat(min.term_to_months) || 999) ? l : min
                        , matchingAmountRowsP[0])
                    : null;
                const shortTermYieldP = shortTermLineP ? parseFloat(shortTermLineP.yield_percent) : productYield;

                const instrumentData = {
                    name: product.name,
                    share: item.share_percent,
                    yield: productYield,
                    short_term_yield: shortTermYieldP
                };

                const bType = (item.bucket_type || 'INITIAL_CAPITAL').toUpperCase().trim();
                if (bType === 'INITIAL_CAPITAL') {
                    initial_instruments.push(instrumentData);
                    weightedYieldAnnual += (productYield * (item.share_percent / 100));
                } else if (bType === 'MONTHLY_SAVINGS' || bType === 'TOP_UP') {
                    monthly_instruments.push(instrumentData);
                    // monthly_instruments.push(instrumentData); // This will be handled later
                }
            }
        }

        const yieldMonthly = this.getMonthlyYield(weightedYieldAnnual);
        const indexationRateDecimal = context.replenishmentIndexationRate ?? ((settings.investment_expense_growth_monthly || 0.1) / 100);
        // SIMULATION
        let simResult;
        let recommendedReplenishment = 0;

        // Check if user provided a fixed replenishment (Direct Calculation)
        // We prioritize explicit input over target-based calculation
        if (goal.monthly_replenishment && goal.monthly_replenishment > 0) {
            console.log(`[PensionCalculator] using Direct Calculation with monthly_replenishment=${goal.monthly_replenishment}`);
            recommendedReplenishment = Number(goal.monthly_replenishment);

            simResult = await this.runSimulation({
                initialCapital: initialCapital, // After deduction from pool
                monthlyReplenishment: recommendedReplenishment,
                termMonths: monthsToPension,
                monthlyYieldRate: this.getMonthlyYield(weightedYieldAnnual),
                indexationRate: infl_month_decimal,
                totalTargetAmount: desiredPensionMonthlyFuture, // Passed for logging/check, not used in direct flow
                avgMonthlyIncome: clientWithIncome.avg_monthly_income,
                pdsProductId: pdsProductId
            }, context);

        } else {
            // Reverse Calculation: Find required replenishment to meet Target Pension
            // We need to cover the Gap
            // const requiredCapitalFuture = (pensionGapMonthlyFuture * 12 * 100) / payoutYieldPercent; // Already calculated above

            recommendedReplenishment = await this.simulateGoal({
                targetAmountFuture: requiredCapitalFuture,
                initialCapital: initialCapital,
                termMonths: monthsToPension,
                monthlyYieldRate: this.getMonthlyYield(weightedYieldAnnual),
                indexationRate: infl_month_decimal,
                pdsProductId: pdsProductId,
                avgMonthlyIncome: clientWithIncome.avg_monthly_income
            }, context);

            // Re-run simulation with the found replenishment to get full details (breakdown, tax benefits)
            simResult = await this.runSimulation({
                initialCapital: initialCapital,
                monthlyReplenishment: recommendedReplenishment,
                termMonths: monthsToPension,
                monthlyYieldRate: this.getMonthlyYield(weightedYieldAnnual),
                indexationRate: infl_month_decimal,
                totalTargetAmount: requiredCapitalFuture,
                avgMonthlyIncome: clientWithIncome.avg_monthly_income,
                pdsProductId: pdsProductId
            }, context);
        }

        // All instruments should already be in initial_instruments/monthly_instruments 
        // from the bucket loop above if they were part of the portfolio.
        // If we want to guarantee PDS is shown even if missing from buckets (legacy), 
        // we should only add if not already present.
        if (pdsProductId && initial_instruments.length === 0) {
            initial_instruments.push({
                name: 'ПДС НПФ (Updated)',
                share: 100,
                yield: weightedYieldAnnual,
                amount: initialCapital
            });
        }
        if (pdsProductId && recommendedReplenishment > 0 && monthly_instruments.length === 0) {
            monthly_instruments.push({
                name: 'ПДС НПФ (Updated)',
                share: 100,
                yield: weightedYieldAnnual,
                amount: recommendedReplenishment
            });
        }

        if (simResult.usedCofinancingPerYear) context.usedCofinancingPerYear = simResult.usedCofinancingPerYear;
        if (simResult.usedTaxBasePerYear) context.usedTaxBasePerYear = simResult.usedTaxBasePerYear;

        const pensionFromCapitalMonthlyFuture = (simResult.totalCapital * (payoutYieldPercent / 100)) / 12;
        const totalPensionMonthlyFuture = pensionFromCapitalMonthlyFuture + statePensionResult.state_pension_monthly_future;

        // Discount to Present Value (Today's buying power)
        const inflationFactor = Math.pow(1 + (inflationAnnualUsed / 100), statePensionResult.years_to_pension);
        const totalPensionMonthlyPresent = totalPensionMonthlyFuture / inflationFactor;

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

        // Separate Own and OPS capital for display
        const displayedInitialCapitalOwn = Math.max(initialCapital - opsCapital, 0);

        return {
            goal_id: goal.id,
            goal_type_id: 1,
            goal_type: 'PENSION',
            summary: {
                status: (recommendedReplenishment <= (client.avg_monthly_income * 0.2)) ? 'OK' : 'GAP',
                target_amount_initial: Math.round((goal.target_amount || totalPensionMonthlyPresent) * 100) / 100,
                target_amount_future: Math.round((desiredPensionMonthlyFuture || totalPensionMonthlyFuture) * 100) / 100,

                projected_pension_monthly_future: Math.round(totalPensionMonthlyFuture * 100) / 100,
                projected_pension_monthly_present: Math.round(totalPensionMonthlyPresent * 100) / 100,

                inflation_rate: Math.round(pensionSettings.inflation_rate * 100) / 100,

                initial_capital: Math.round(displayedInitialCapitalOwn * 100) / 100,
                initial_capital_ops: Math.round(opsCapital * 100) / 100,

                monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                pension_gap_future: Math.round(pensionGapMonthlyFuture * 100) / 100,
                target_months: monthsToPension,

                projected_capital_at_retirement: Math.round(simResult.totalCapital * 100) / 100,
                required_capital_at_retirement: Math.round(requiredCapitalFuture * 100) / 100,

                total_tax_benefit: Math.round(simResult.totalTaxRefund * 100) / 100,
                total_cofinancing: Math.round(simResult.totalCofinancing * 100) / 100,

                accumulation_yield_percent: Math.round(weightedYieldAnnual * 100) / 100,
                payout_yield_percent: payoutYieldPercent,

                state_pension_monthly_future: Math.round(statePensionResult.state_pension_monthly_future * 100) / 100,
                state_pension_monthly_today: Math.round(statePensionResult.state_pension_monthly_current * 100) / 100,
                ipk_current: statePensionResult.ipk_current
            },
            details: {
                state_pension: {
                    ipk_total: statePensionResult.ipk_total,
                    ipk_current: statePensionResult.ipk_current,
                    ipk_forecast: statePensionResult.ipk_forecast,
                    point_cost_today: statePensionResult.point_cost_today,
                    point_cost_future: statePensionResult.point_cost_future,
                    fixed_payment_today: statePensionResult.fixed_payment_today,
                    fixed_payment_future: statePensionResult.fixed_payment_future,
                    retirement_age: statePensionResult.retirement_age,
                    retirement_year: statePensionResult.retirement_year,
                    years_to_pension: statePensionResult.years_to_pension
                },
                initial_instruments: initial_instruments,
                monthly_instruments: monthly_instruments,
                yearly_breakdown: simResult.yearlyBreakdown
            }
        };
    }
}

module.exports = new PensionCalculator();
