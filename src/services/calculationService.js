const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');
const pdsCofinancingService = require('./pdsCofinancingService');

class CalculationService {
    /**
     * Рассчитать прогнозную государственную пенсию
     * @param {Object} client - Данные клиента (ClientData)
     * @param {Object} systemSettings - Системные настройки пенсии
     * @param {Date} nowDate - Текущая дата
     * @returns {Object} Результат расчета госпенсии
     */
    async calculateStatePension(client, systemSettings, nowDate) {
        // 1. Возраст и стаж
        const currentYear = nowDate.getFullYear();
        const birthDate = new Date(client.birth_date);
        const birthYear = birthDate.getFullYear();
        const age = currentYear - birthYear;
        const yearsOfWork = Math.max(age - 18, 0); // Допущение: работа началась в 18 лет

        // 2. Пенсионный возраст и год выхода
        const sex = client.sex || '';
        const isMale = sex === 'male' || sex === 'M' || sex === 'мужской';
        const retirementAge = isMale ? 65 : 60;
        const retirementYear = birthYear + retirementAge;
        const yearsToPension = Math.max(retirementYear - currentYear, 0);

        // 3. Оценка ИПК

        // Вспомогательный расчет ИПК за 1 год при текущем доходе (для оценки будущего и прошлого)
        const avgMonthlyIncome = client.avg_monthly_income || 0;
        const incomeAnnual = avgMonthlyIncome * 12;
        const pensionMaxSalaryLimit = systemSettings.pension_max_salary_limit || 2759000;
        const pensionPfrContributionRatePart1 = systemSettings.pension_pfr_contribution_rate_part1 || 22;

        const baseUsed = Math.min(incomeAnnual, pensionMaxSalaryLimit);
        const contribs = baseUsed * (pensionPfrContributionRatePart1 / 100);
        const maxContribs = pensionMaxSalaryLimit * (pensionPfrContributionRatePart1 / 100);

        // ИПК, зарабатываемый за один год сейчас (максимум 10)
        let ipkYearNow = 0;
        if (maxContribs > 0) {
            ipkYearNow = Math.max(0, Math.min(10, 10 * (contribs / maxContribs)));
        }

        // Накопленный ИПК (до сегодняшнего дня)
        let ipkSoFar = 0;

        if (client.ipk_current !== null && client.ipk_current !== undefined) {
            // Если ИПК передан с фронта (например с Госуслуг), используем его
            ipkSoFar = Number(client.ipk_current);
        } else {
            // Иначе оцениваем прошлое через коэффициент
            const pensionIpkPastCoef = systemSettings.pension_ipk_past_coef || 0.6;
            const avgIpkPast = ipkYearNow * pensionIpkPastCoef;
            ipkSoFar = avgIpkPast * yearsOfWork;
        }

        // Будущий ИПК (от сегодня до пенсии)
        // Предполагаем сохранение текущего уровня дохода (в реальном выражении)
        const ipkFuture = ipkYearNow * yearsToPension;

        // Итоговый прогнозный ИПК
        const ipkEst = ipkSoFar + ipkFuture;

        // 4. Индексация фиксированной выплаты и стоимости балла до выхода на пенсию
        const inflationRate = systemSettings.inflation_rate || 4.0;
        const pensionPointCost = systemSettings.pension_point_cost || 145.69;
        const pensionFixedPayment = systemSettings.pension_fixed_payment || 8907;

        const pensionPointCostFuture = pensionPointCost * Math.pow(1 + (inflationRate / 100), yearsToPension);
        const pensionFixedPaymentFuture = pensionFixedPayment * Math.pow(1 + (inflationRate / 100), yearsToPension);

        // 5. Прогнозная госпенсия на год выхода (в ценах того года)
        const statePensionMonthlyFuture = ipkEst * pensionPointCostFuture + pensionFixedPaymentFuture;

        return {
            ipk_est: Math.round(ipkEst * 100) / 100,
            state_pension_monthly_future: Math.round(statePensionMonthlyFuture * 100) / 100,
            state_pension_monthly_current: Math.round(statePensionMonthlyFuture / Math.pow(1 + (inflationRate / 100), yearsToPension) * 100) / 100, // В ценах сегодня
            retirement_age: retirementAge,
            retirement_year: retirementYear,
            years_to_pension: yearsToPension,
            years_of_work: yearsOfWork,
            age: age
        };
    }

    _getPriority(goal) {
        // 1: Reservoir/Emergency
        // 2: Pension (id 1)
        // 3: Passive Income (id 2) / Life (id 5)
        // 4: Investment (id 3) / Other
        const name = (goal.name || '').toUpperCase();
        // Keep name check for backward compatibility or explicit "Reservation" naming
        if (name.includes('РЕЗЕРВ') || name.includes('RESERVOIR')) return 1;

        const map = {
            7: 1, // FinReserve
            1: 2, // Pension
            2: 3, // Passive Income
            5: 3  // Life
        };
        return map[goal.goal_type_id] || 4;
    }

    /**
     * Simulate goal accumulation and find required monthly replenishment
     * @param {Object} params 
     */
    async _simulateGoal(params) {
        const {
            initialCapital,
            targetAmountFuture, // Already inflation-adjusted
            termMonths,
            monthlyYieldRate,
            monthlyInflationRate,
            inflows = [], // Array of { month, amount }
            initialReplenishment = 0 // Starting guess if any
        } = params;

        // Implementation of finding replenishment using binary search or similar
        // For simplicity, let's start with a simulation function first
        const simulate = (mReplen) => {
            let balance = initialCapital;
            let currentReplen = mReplen;

            // Add month 0 inflows
            const m0Inflows = inflows.filter(i => i.month === 0);
            for (const inf of m0Inflows) balance += inf.amount;

            for (let m = 1; m <= termMonths; m++) {
                // Yield accrual
                balance *= (1 + monthlyYieldRate);
                // Monthly top-up
                balance += currentReplen;
                // Add inflows for this month
                const monthInflows = inflows.filter(i => i.month === m);
                for (const inf of monthInflows) balance += inf.amount;
                // Indexation
                currentReplen *= (1 + monthlyInflationRate);
            }
            return balance;
        };

        // Binary search for replenishment
        let low = 0;
        let high = targetAmountFuture; // Safe upper bound
        let mid = 0;

        // If we already have enough capital
        if (simulate(0) >= targetAmountFuture) return 0;

        for (let i = 0; i < 40; i++) { // 40 iterations for high precision
            mid = (low + high) / 2;
            if (simulate(mid) < targetAmountFuture) {
                low = mid;
            } else {
                high = mid;
            }
        }

        return high;
    }

    /**
     * Get all inflows for a goal (Fixed + allocated from Shared Pool)
     */
    _getGoalInflows(goal, assets, sharedPoolEvents, termMonths, initialCapital, targetAmountFuture, yieldMonthly, inflationMonthly, replenishment = 0) {
        const fixedInflows = assets
            .filter(a => a.goal_id === goal.id || a.goal_id === String(goal.id))
            .map(a => ({
                month: a.unlock_month || a.sell_month || 0,
                amount: Number(a.amount || a.current_value || 0)
            }));

        const sharedInflowsTaken = [];
        if (targetAmountFuture > 0) {
            const getFV = (replen, infs) => {
                let b = initialCapital;
                let r = replen;
                for (let m = 1; m <= termMonths; m++) {
                    const mInfs = infs.filter(i => i.month === m);
                    for (const inf of mInfs) b += inf.amount;
                    b *= (1 + yieldMonthly);
                    b += r;
                    r *= (1 + inflationMonthly);
                }
                return b;
            };

            const fvWithoutShared = getFV(replenishment, fixedInflows);
            let gapFuture = Math.max(0, targetAmountFuture - fvWithoutShared);

            if (gapFuture > 0) {
                for (const event of sharedPoolEvents) {
                    if (event.month > termMonths) continue;
                    if (event.amount <= 0) continue;

                    const fvMultiplier = Math.pow(1 + yieldMonthly, termMonths - event.month);
                    const neededNow = gapFuture / fvMultiplier;
                    const takenAmount = Math.min(event.amount, neededNow);

                    if (takenAmount > 0) {
                        event.amount -= takenAmount;
                        sharedInflowsTaken.push({ month: event.month, amount: takenAmount });
                        gapFuture -= (takenAmount * fvMultiplier);
                    }
                    if (gapFuture <= 0) break;
                }
            }
        }
        return { fixedInflows, sharedInflowsTaken, allInflows: [...fixedInflows, ...sharedInflowsTaken] };
    }

    _calculateLifeInsuranceNeed(client, goals) {
        const existingLife = goals.find(g => g.goal_type_id === 5 || (g.name && g.name.toUpperCase() === 'LIFE') || (g.name && g.name.includes('Жизнь')));
        if (existingLife) return;

        const birthDate = client.birth_date ? new Date(client.birth_date) : new Date();
        const age = new Date().getFullYear() - birthDate.getFullYear();
        const income = client.avg_monthly_income || 0;
        if (income <= 0) return;

        const yearsTo70 = Math.max(0, 70 - age);
        const termYears = Math.min(20, yearsTo70);
        if (termYears <= 0) return;

        let targetAmount = income * 36;
        let annualPremium = (targetAmount / termYears) * 1.2;
        let monthlyPremium = annualPremium / 12;

        const budgetCap = income * 0.04;
        if (monthlyPremium > budgetCap) {
            monthlyPremium = budgetCap;
            annualPremium = monthlyPremium * 12;
            targetAmount = (annualPremium / 1.2) * termYears;
        }

        goals.push({
            goal_type_id: 5,
            name: 'Страхование жизни (Smart)',
            priority: 2,
            is_policymaker: true, // Added flag
            term_months: termYears * 12,
            target_amount: targetAmount,
            monthly_replenishment: monthlyPremium,
            initial_capital: 0,
            inflation_rate: 0
        });
        console.log(`[SmartLife] Injected: Term ${termYears}y, Coverage ${Math.round(targetAmount)}, Premium ${Math.round(monthlyPremium)}`);
    }

    /**
     * Perform First Run calculation for a client request
     * @param {Object} data - CalculationRequest data
     */
    async calculateFirstRun(data) {
        const { goals, client } = data;
        const clientData = client || {};

        // this._calculateLifeInsuranceNeed(clientData, goals); // Disabled by user request (30.12.2025)

        // 1. COLLECT ASSETS AND POOL
        let poolBalance = Number(clientData.total_liquid_capital || 0);
        const assets = clientData.assets || [];

        // Chronological list of shared pool events (unlock_month: 0 is current liquid)
        const sharedPoolEvents = assets
            .filter(a => !a.goal_id)
            .map(a => ({
                month: a.unlock_month || a.sell_month || 0,
                amount: Number(a.amount || a.current_value || 0)
            }))
            .sort((a, b) => a.month - b.month);

        // Add initial liquid to the start
        sharedPoolEvents.unshift({ month: 0, amount: poolBalance });

        // 2. Fetch System Settings
        let m_month_percent = 0.0;
        try {
            const setting = await settingsService.get('investment_expense_growth_monthly');
            if (setting && setting.value) {
                m_month_percent = Number(setting.value);
            }
        } catch (e) {
            console.warn('Could not fetch investment_expense_growth_monthly, using default 0.0');
        }

        let db_inflation_year_percent = 4.0;
        try {
            const setting = await settingsService.get('inflation_rate_year');
            if (setting && setting.value) {
                db_inflation_year_percent = Number(setting.value);
            }
        } catch (e) {
            console.warn('Could not fetch inflation_rate_year, using default 4.0');
        }

        const usedCofinancingPerYear = {};
        const resultsIndexed = [];

        // 3. SORT GOALS BY PRIORITY
        // 1. Priority (highest first)
        // 2. Term (shortest first)
        const indexedGoals = (goals || []).map((g, i) => ({ goal: g, index: i }))
            .sort((a, b) => {
                const pA = a.goal.priority || this._getPriority(a.goal);
                const pB = b.goal.priority || this._getPriority(b.goal);
                if (pA !== pB) return pA - pB;
                return (a.goal.term_months || 0) - (b.goal.term_months || 0);
            });

        for (const { goal, index } of indexedGoals) {
            // ---------------------------------------------------------
            // 1. DETERMINE GOAL TYPE
            // ---------------------------------------------------------

            // PENSION (id=1)
            const isPensionGoal = goal.goal_type_id === 1 || (goal.name && goal.name.toUpperCase().includes('ПЕНСИЯ'));

            // PASSIVE_INCOME (id=2) - "Рантье"
            const isPassiveIncomeGoal = goal.goal_type_id === 2 || (goal.name && goal.name.toUpperCase().includes('РАНТЬЕ'));

            // INVESTMENT (id=3) - Refactored to use logic at end of loop (Projection)
            const isInvestmentGoal = false; // goal.goal_type_id === 3 ... DISABLED

            // LIFE (id=5) - "Жизнь" / NSJ
            const isLifeGoal = goal.goal_type_id === 5 || goal.name === 'Жизнь';

            // FIN_RESERVE (id=7) or name match
            const isFinReserveGoal = goal.goal_type_id === 7 || (goal.name && goal.name.toUpperCase().includes('РЕЗЕРВ'));

            // Если это цель типа INVESTMENT / CAPITAL / FIN_RESERVE
            if (isInvestmentGoal || isFinReserveGoal) {
                console.log('=== INVESTMENT CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);

                try {
                    // 1. ПАРАМЕТРЫ
                    const initialCapital = goal.initial_capital || 0;
                    const replenishment = goal.monthly_replenishment || goal.replenishment_amount || 0; // Using specific field if available, or assume passed in another way?
                    // Usually 'target_amount' is present, but here we calculate Result. 
                    // However, 'monthly_replenishment' might be passed as 'initial_replenishment' or user might provide it in 'goal.monthly_replenishment'.
                    // If not present, we can't calculate accumulation properly unless we assume 0.
                    // Let's assume input has 'monthly_replenishment'.


                    const termMonths = goal.term_months || 120; // Default 10 years if missing
                    const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
                    const inflationMonthly = Math.pow(1 + (inflationRate / 100), 1 / 12) - 1;

                    // --- NEW: ASSET ALLOCATION ---
                    // No initial declaration here, we'll get them from helper below
                    const targetAmount = goal.target_amount || 0;
                    const targetAmountFuture = targetAmount * Math.pow(1 + inflationMonthly, termMonths);

                    // 2. ИЩЕМ ПОРТФЕЛЬ
                    const portfolio = await portfolioRepository.findByCriteria({
                        classId: 3, // Assuming ID 3 for Investment/Capital based on heuristic
                        amount: initialCapital,
                        term: termMonths
                    });

                    if (!portfolio) {
                        throw new Error(`No portfolio found for Investment calculation (Class ID 3, Amount ${initialCapital}, Term ${termMonths})`);
                    }

                    // 3. СЧИТАЕМ ДОХОДНОСТЬ ПОРТФЕЛЯ (Взвешенная)
                    let riskProfiles = typeof portfolio.risk_profiles === 'string'
                        ? JSON.parse(portfolio.risk_profiles)
                        : portfolio.risk_profiles;

                    const profile = riskProfiles.find(p => p.profile_type === (goal.risk_profile || 'BALANCED'));

                    if (!profile) {
                        throw new Error(`Risk profile ${goal.risk_profile} not found in portfolio ${portfolio.name}`);
                    }

                    // Calculate Weighted Yield AND Build Composition
                    let weightedYieldAnnual = 0;

                    // Prepare Composition arrays
                    const initialCapitalComposition = [];
                    const topUpComposition = [];

                    // --- INITIAL CAPITAL ALLOCATION ---
                    let instruments = profile.initial_capital || [];
                    if (!instruments.length && profile.instruments) {
                        instruments = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                    }

                    // We declare capitalDistribution here for clarity and use in top-up fallback
                    const capitalDistribution = instruments;

                    for (const item of capitalDistribution) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        const amountForProduct = Math.max(initialCapital * (item.share_percent / 100), 1);

                        const yields = product.yields || [];
                        const line = yields.find(l =>
                            termMonths >= l.term_from_months &&
                            termMonths <= l.term_to_months &&
                            amountForProduct >= parseFloat(l.amount_from) &&
                            amountForProduct <= parseFloat(l.amount_to)
                        ) || yields.find(l =>
                            termMonths >= l.term_from_months &&
                            termMonths <= l.term_to_months
                        ) || yields[0];

                        const pYield = line ? parseFloat(line.yield_percent) : 0;
                        weightedYieldAnnual += pYield * (item.share_percent / 100);

                        initialCapitalComposition.push({
                            product_id: product.id,
                            product_name: product.name,
                            product_type: product.product_type,
                            share_percent: item.share_percent,
                            amount: Math.round(amountForProduct * 100) / 100,
                            yield_percent: pYield
                        });
                    }

                    console.log(`Weighted Annual Yield: ${weightedYieldAnnual}%`);

                    // --- TOP-UP ALLOCATION (for Composition display) ---
                    let topUpInstrumentsForComposition = profile.top_up || [];
                    if (!topUpInstrumentsForComposition.length && profile.instruments) {
                        topUpInstrumentsForComposition = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                    }
                    // Fallback to initial structure if top-up not defined (often they are same)
                    // But we need to build the composition array
                    if (!topUpInstrumentsForComposition.length && instruments.length > 0) {
                        // If no explicit top-up, usually it follows initial capital OR it might be empty?
                        // In our logic, if topUp is empty, we might not be replenishing into specific products?
                        // Actually, accumulation logic assumes "weightedYieldAnnual" applies to EVERYTHING.
                        // So implicit assumption implies TopUp structure == Initial Structure if not defined.
                        // Let's mirror initial for display if empty, or map explicit.
                        topUpInstrumentsForComposition = instruments; // Fallback for display
                    }

                    for (const item of topUpInstrumentsForComposition) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        // Yield for TopUp might be different due to smaller amounts per month?
                        // BUT for simplicity in "Weighted Yield" calculation above, we used Initial Capital amounts.
                        // Strictly speaking, we should re-calculate weighted yield for TopUps if amounts differ drastically and hit different yield lines.
                        // For MVP/V1, we use the same Portfolio Yield.
                        // Here we just record metadata.
                        const pYield = weightedYieldAnnual; // Simplified for display, or fetch precise? Let's leave undefined or portfolio avg for now to avoid confusion.

                        topUpComposition.push({
                            product_id: product.id,
                            product_name: product.name,
                            product_type: product.product_type,
                            share_percent: item.share_percent,
                            amount: Math.round((replenishment * (item.share_percent / 100)) * 100) / 100,
                            yield_percent: null // Not strictly calculated per line
                        });
                    }

                    // 4. ДИНАМИЧЕСКОЕ РАСПРЕДЕЛЕНИЕ ИЗ ПУЛА
                    const yieldMonthly = Math.pow(1 + (weightedYieldAnnual / 100), 1 / 12) - 1;

                    // Prioritize pool usage by assuming 0 replenishment first
                    const { fixedInflows, sharedInflowsTaken, allInflows } = this._getGoalInflows(
                        goal, assets, sharedPoolEvents, termMonths, initialCapital, targetAmountFuture, yieldMonthly, inflationMonthly, 0
                    );

                    // --- NEW: SOLVE FOR RECOMMENDED REPLENISHMENT ---
                    let recommendedReplenishment = 0;
                    if (targetAmountFuture > 0) {
                        recommendedReplenishment = await this._simulateGoal({
                            initialCapital: initialCapital,
                            targetAmountFuture: targetAmountFuture,
                            termMonths: termMonths,
                            monthlyYieldRate: yieldMonthly,
                            monthlyInflationRate: inflationMonthly,
                            inflows: allInflows
                        });
                    } else {
                        recommendedReplenishment = replenishment || 0;
                    }

                    const recommendedReplenishmentRaw = recommendedReplenishment;

                    // 5. НАКОПЛЕНИЕ
                    const sharedInitial = sharedInflowsTaken
                        .filter(i => i.month === 0)
                        .reduce((sum, i) => sum + i.amount, 0);

                    const effectiveInitialCapital = initialCapital + sharedInitial;
                    const effectiveYieldMonthly = yieldMonthly;

                    let accumulatedOwnCapital = effectiveInitialCapital;
                    let totalOwnContributions = effectiveInitialCapital;
                    let currentReplenishment = recommendedReplenishment;

                    const yearlyBreakdownOwn = [];

                    for (let m = 1; m <= termMonths; m++) {
                        // Add Inflows (from month 1 onwards)
                        const monthInflows = allInflows.filter(i => i.month === m);
                        for (const inf of monthInflows) {
                            accumulatedOwnCapital += inf.amount;
                            totalOwnContributions += inf.amount;
                        }

                        // 2. Accrue Interest
                        accumulatedOwnCapital *= (1 + effectiveYieldMonthly);

                        // 3. Add Replenishment
                        accumulatedOwnCapital += currentReplenishment;
                        totalOwnContributions += currentReplenishment;

                        // 4. Index Replenishment
                        currentReplenishment *= (1 + inflationMonthly);

                        if (m % 12 === 0) {
                            yearlyBreakdownOwn.push({
                                year: Math.ceil(m / 12),
                                accumulated_capital: accumulatedOwnCapital,
                                total_contributions: totalOwnContributions
                            });
                        }
                    }

                    // 5. ПДС (Софинансирование)
                    let pdsResult = null;
                    let pdsShareInitial = 0;
                    let pdsShareTopUp = 0;
                    let pdsProductId = null;

                    // Find PDS share
                    for (const item of instruments) {
                        const product = await productRepository.findById(item.product_id);
                        if (product && product.product_type === 'PDS') {
                            pdsProductId = product.id;
                            pdsShareInitial = item.share_percent;
                            break;
                        }
                    }
                    // Find Top Up share (assuming structure similar to PassiveIncome check)
                    let topUpInstruments = profile.top_up || [];
                    if (!topUpInstruments.length && profile.instruments) {
                        topUpInstruments = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                    }

                    if (pdsProductId) {
                        for (const item of topUpInstruments) {
                            if (item.product_id == pdsProductId) {
                                pdsShareTopUp = item.share_percent;
                                break;
                            }
                        }
                    } else {
                        // If not found in initial, search in top-up
                        for (const item of topUpInstruments) {
                            const product = await productRepository.findById(item.product_id);
                            if (product && product.product_type === 'PDS') {
                                pdsProductId = product.id;
                                pdsShareTopUp = item.share_percent;
                                break;
                            }
                        }
                    }

                    if (!pdsShareTopUp && pdsShareInitial) pdsShareTopUp = pdsShareInitial; // Fallback

                    if (pdsProductId) {
                        const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;
                        const startDate = goal.start_date ? new Date(goal.start_date) : new Date();

                        // Use service to calculate State Capital accumulation
                        // We use the "Gap" service but ignore gap-specific returns, looking only at 'total_cofinancing_with_investment'
                        // and 'yearly_breakdown'.
                        // We pass 'replenishment' as 'initialReplenishment'.
                        // 'capitalGap' irrelevant -> pass 0 or a dummy big number, it returns total cofinancing anyway.

                        pdsResult = await pdsCofinancingService.calculateCofinancingEffect({
                            capitalGap: 0,
                            initialReplenishment: replenishment,
                            initialCapital: effectiveInitialCapital,
                            pdsShareInitial: pdsShareInitial,
                            pdsShareTopUp: pdsShareTopUp,
                            pdsProductId: pdsProductId,
                            termMonths: termMonths,
                            avgMonthlyIncome: avgMonthlyIncome,
                            startDate: startDate,
                            monthlyGrowthRate: inflationMonthly, // Indexation
                            portfolioYieldMonthly: yieldMonthly,
                            usedCofinancingPerYear
                        });

                        // Обновляем использованное софинансирование для следующих целей
                        if (pdsResult && pdsResult.actualUsedCofinancingPerYear) {
                            for (const yr in pdsResult.actualUsedCofinancingPerYear) {
                                usedCofinancingPerYear[yr] = (usedCofinancingPerYear[yr] || 0) + pdsResult.actualUsedCofinancingPerYear[yr];
                            }
                        }
                    }

                    const totalStateCapital = pdsResult ? pdsResult.total_cofinancing_with_investment : 0;
                    const totalCapital = accumulatedOwnCapital + totalStateCapital;

                    resultsIndexed.push({
                        index, result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'INVESTMENT',
                            investment_calculation: {
                                initial_capital: initialCapital,
                                monthly_replenishment_start: replenishment,
                                term_months: termMonths,
                                portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100,
                                inflation_rate_annual: inflationRate,

                                total_capital: Math.round(totalCapital * 100) / 100,
                                total_own_capital: Math.round(accumulatedOwnCapital * 100) / 100,
                                total_state_capital: Math.round(totalStateCapital * 100) / 100,
                                total_own_contributions: Math.round(totalOwnContributions * 100) / 100,

                                yearly_breakdown_own: yearlyBreakdownOwn
                            },
                            pds_cofinancing: pdsResult ? {
                                cofinancing_next_year: pdsResult.cofinancing_next_year,
                                total_cofinancing_nominal: pdsResult.total_cofinancing_nominal,
                                total_cofinancing_with_investment: pdsResult.total_cofinancing_with_investment,
                                pds_yield_annual_percent: pdsResult.pds_yield_annual_percent,
                                yearly_breakdown: pdsResult.yearly_breakdown
                            } : null,

                            // --- NEW: Unified Summary & Detail Blocks ---
                            summary: {
                                goal_type: 'INVESTMENT',
                                status: (totalCapital >= targetAmountFuture * 0.999) ? 'OK' : 'GAP',
                                initial_capital: Math.round(effectiveInitialCapital * 100) / 100,
                                monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                                monthly_replenishment_without_pds: Math.round(recommendedReplenishment * 100) / 100,
                                total_capital_at_end: Math.round(totalCapital * 100) / 100,
                                target_achieved: (totalCapital >= targetAmountFuture * 0.999),
                                projected_value: Math.round(targetAmountFuture * 100) / 100,
                                state_benefit: Math.round(totalStateCapital * 100) / 100
                            },
                            portfolio_structure: {
                                risk_profile: goal.risk_profile || 'BALANCED',
                                portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100,
                                inflation_rate_used: inflationRate,
                                portfolio_composition: {
                                    initial_capital_allocation: initialCapitalComposition,
                                    monthly_topup_allocation: topUpComposition
                                }
                            }
                        }
                    });

                    continue;

                } catch (err) {
                    console.error('Investment calculation error:', err);
                    resultsIndexed.push({
                        index, result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'INVESTMENT',
                            error: err.message
                        }
                    });
                    continue;
                }
            }

            if (isLifeGoal) {
                console.log('=== NSJ CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);
                console.log('Target amount:', goal.target_amount, 'Term months:', goal.term_months);
                console.log('Client data:', JSON.stringify(client || {}, null, 2));

                try {
                    const nsjParams = {
                        target_amount: goal.target_amount,
                        term_months: goal.term_months,
                        client: client || {},
                        payment_variant: goal.payment_variant || 12, // Default to Monthly for Smart Goals
                        program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test'
                    };
                    console.log('Calling nsjApiService.calculateLifeInsurance (Smart or Manual) with params:', JSON.stringify(nsjParams, null, 2));

                    let nsjResult;
                    try {
                        nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
                    } catch (apiError) {
                        // If it's a smart goal, we have a fallback. If manual, rethrow to outer catch.
                        if (goal.is_policymaker) {
                            console.warn('NSJ API Failed for Smart Goal, using Fallback Calculation:', apiError.message);
                            throw { is_smart_fallback: true };
                        }
                        throw apiError;
                    }


                    resultsIndexed.push({
                        index,
                        result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'LIFE',
                            summary: {
                                goal_type: 'LIFE',
                                status: 'OK',
                                initial_capital: 0,
                                monthly_replenishment: Math.round((nsjResult.total_premium || 0) / (nsjResult.term_years ? nsjResult.term_years * 12 : 1)),
                                monthly_replenishment_without_pds: 0,
                                total_capital_at_end: nsjResult.total_limit || 0,
                                target_achieved: true,
                                projected_value: nsjResult.total_limit || 0,
                                state_benefit: 0
                            },
                            nsj_calculation: nsjResult
                        }
                    });
                    continue;
                } catch (nsjError) {
                    // Fallback for Smart Goals if API failed OR specifically triggered
                    if (goal.is_policymaker || nsjError.is_smart_fallback) {
                        console.log('Using Smart Life Fallback (Bypass) due to API error or choice');
                        resultsIndexed.push({
                            index,
                            result: {
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'LIFE',
                                summary: {
                                    goal_type: 'LIFE',
                                    status: 'OK',
                                    initial_capital: 0,
                                    monthly_replenishment: Math.round((goal.monthly_replenishment || 0) * 100) / 100,
                                    monthly_replenishment_without_pds: Math.round((goal.monthly_replenishment || 0) * 100) / 100,
                                    total_capital_at_end: Math.round((goal.target_amount || 0) * 100) / 100,
                                    target_achieved: true,
                                    projected_value: Math.round((goal.target_amount || 0) * 100) / 100,
                                    state_benefit: 0
                                },
                                nsj_calculation: {
                                    success: true,
                                    term_years: Math.round((goal.term_months || 0) / 12),
                                    total_premium: Math.round((goal.monthly_replenishment || 0) * (goal.term_months || 0)),
                                    total_limit: goal.target_amount,
                                    warnings: ['Calculated by Smart Engine (Fallback Mode)']
                                }
                            }
                        });
                        continue;
                    }

                    console.error('NSJ API Error for goal:', goal.name, nsjError);
                    const errorMessage = nsjError.message || nsjError.status || 'Unknown error';
                    const errorDetails = nsjError.errors || nsjError.warnings || nsjError.details || [];
                    const fullError = {
                        message: errorMessage,
                        status: nsjError.status,
                        errors: nsjError.errors || [],
                        warnings: nsjError.warnings || [],
                        full_response: nsjError.full_response || null
                    };
                    resultsIndexed.push({
                        index,
                        result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'LIFE',
                            // Add dummy summary for robustness
                            summary: {
                                goal_type: 'LIFE',
                                status: 'ERROR',
                                initial_capital: 0,
                                monthly_replenishment: 0,
                                monthly_replenishment_without_pds: 0,
                                total_capital_at_end: 0,
                                target_achieved: false,
                                projected_value: 0,
                                state_benefit: 0
                            },
                            error: `NSJ calculation failed: ${errorMessage}`,
                            nsj_error_details: errorDetails,
                            nsj_error_full: fullError // Полная информация об ошибке для отладки
                        }
                    });
                    continue;
                }
            }

            // Если это цель типа PASSIVE_INCOME, используем специальную логику расчета
            if (isPassiveIncomeGoal) {
                console.log('=== PASSIVE INCOME CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);
                console.log('Target monthly income:', goal.target_amount, 'Term months:', goal.term_months);

                try {
                    // Шаг 1: Пересчет желаемого дохода с учетом инфляции
                    const inflationAnnualUsed = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
                    const infl_month_decimal = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;
                    const desiredMonthlyIncomeWithInflation = goal.target_amount * Math.pow(1 + infl_month_decimal, goal.term_months);

                    console.log('Desired monthly income (initial):', goal.target_amount);
                    console.log('Desired monthly income (with inflation):', desiredMonthlyIncomeWithInflation);

                    // Шаг 2: Поиск линии доходности по сроку и расчет необходимого капитала
                    const yieldLine = await settingsService.findPassiveIncomeYieldLine(0, goal.term_months, true); // byTermOnly = true

                    if (!yieldLine) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            error: `No yield line found for term ${goal.term_months} months in passive income yield settings`
                        });
                        continue;
                    }

                    console.log('Found yield line:', yieldLine);
                    const yieldPercent = yieldLine.yield_percent;

                    // Расчет необходимого капитала: (желаемый_доход_с_инфляцией * 12 * 100) / yield_percent
                    const requiredCapital = (desiredMonthlyIncomeWithInflation * 12 * 100) / yieldPercent;

                    console.log('Required capital:', requiredCapital);
                    console.log('Yield percent:', yieldPercent);

                    // Шаг 3: Расчет пополнений (без повторной инфляции)
                    const Month = goal.term_months;
                    const InitialCapital = goal.initial_capital || 0;

                    // Получаем доходность портфеля (используем yield из линии)
                    const d_annual = yieldPercent;
                    const d_month_decimal = Math.pow(1 + (d_annual / 100), 1 / 12) - 1;

                    const m_month_decimal = m_month_percent / 100;
                    const CostWithInflation = requiredCapital;
                    const Cost = (requiredCapital / Math.pow(1 + infl_month_decimal, Month));

                    const sharedInitial = sharedInflowsTaken
                        .filter(i => i.month === 0)
                        .reduce((sum, i) => sum + i.amount, 0);
                    const effectiveInitialCapital = InitialCapital + sharedInitial;

                    // Solve for recommendedReplenishment using simulation
                    let recommendedReplenishment = await this._simulateGoal({
                        initialCapital: InitialCapital,
                        targetAmountFuture: CostWithInflation,
                        termMonths: Month,
                        monthlyYieldRate: d_month_decimal,
                        monthlyInflationRate: infl_month_decimal,
                        inflows: allInflows
                    });

                    // For legacy summary logic
                    const CapitalGap = Math.max(0, CostWithInflation - (InitialCapital * Math.pow(1 + d_month_decimal, Month)));

                    // Шаг 4: Проверка на ПДС и софинансирование
                    // Для пассивного дохода нужно найти портфель, чтобы проверить наличие ПДС
                    const portfolio = await portfolioRepository.findByCriteria({
                        classId: goal.goal_type_id,
                        amount: goal.initial_capital || 0, // Используем первоначальный капитал для выбора портфеля
                        term: goal.term_months
                    });

                    let recommendedReplenishmentRaw = recommendedReplenishment;
                    let capitalDistribution = [];
                    let pdsCofinancingResult = null;
                    const initialCapitalComposition = [];
                    const topUpComposition = [];
                    let pdsProductId = null;
                    let pdsShareInitial = 0;
                    let pdsShareTopUp = 0;

                    if (portfolio) {
                        let riskProfiles = portfolio.risk_profiles;
                        if (typeof riskProfiles === 'string') {
                            try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
                        }

                        const profile = riskProfiles.find(p => p.profile_type === (goal.risk_profile || 'BALANCED'));

                        if (!profile) {
                            resultsIndexed.push({
                                index, result: {
                                    goal_id: goal.goal_type_id,
                                    goal_name: goal.name,
                                    goal_type: 'PASSIVE_INCOME',
                                    error: `Risk profile ${goal.risk_profile || 'BALANCED'} not found in portfolio ${portfolio.name}`
                                }
                            });
                            continue;
                        }

                        // Support legacy and new structure for distributions
                        capitalDistribution = profile.initial_capital || [];
                        if (!capitalDistribution.length && profile.instruments) {
                            capitalDistribution = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                        }

                        let topUpDistribution = profile.top_up || [];
                        if (!topUpDistribution.length && profile.instruments) {
                            topUpDistribution = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                        }

                        pdsProductId = null;
                        pdsShareInitial = 0;
                        pdsShareTopUp = 0;

                        // Ищем ПДС в initial_capital
                        for (const item of capitalDistribution) {
                            const product = await productRepository.findById(item.product_id);
                            if (product && product.product_type === 'PDS') {
                                pdsProductId = product.id;
                                pdsShareInitial = item.share_percent;
                                break;
                            }
                        }

                        // Ищем ПДС в top_up
                        if (pdsProductId) {
                            for (const item of topUpDistribution) {
                                if (item.product_id == pdsProductId) {
                                    pdsShareTopUp = item.share_percent;
                                    break;
                                }
                            }
                        } else {
                            // Если не нашли в initial, ищем в top_up
                            for (const item of topUpDistribution) {
                                const product = await productRepository.findById(item.product_id);
                                if (product && product.product_type === 'PDS') {
                                    pdsProductId = product.id;
                                    pdsShareTopUp = item.share_percent;
                                    break;
                                }
                            }
                        }

                        // Если в top_up нет ПДС, а в initial есть, пробуем использовать ту же долю (fallback)
                        if (pdsProductId && !pdsShareTopUp && pdsShareInitial) {
                            pdsShareTopUp = pdsShareInitial;
                        }

                        // --- BUILD ALLOCATION ARRAYS FOR COMPOSITION (Unified API) ---
                        // (Use existing initialCapitalComposition and topUpComposition declared at lines 574-575)

                        // To match Investment logic, we need to fetch all products in composition
                        // We use the already built capitalDistribution
                        for (const item of capitalDistribution) {
                            const product = await productRepository.findById(item.product_id);
                            if (!product) continue;
                            const amountForProduct = Math.max(InitialCapital * (item.share_percent / 100), 1);

                            // Simplified Yield fetch for display - matching PDS logic somewhat or just getting product lines
                            // For Passive Income we currently use Global Yield Line setting, but composition should show product yields if possible?
                            // "Weighted Yield" is not strictly used in Passive Income calc (it uses the Yield curve setting),
                            // BUT the Portfolio Composition should reflect what sits inside.
                            const yields = product.yields || [];
                            const line = yields.find(l =>
                                Month >= l.term_from_months &&
                                Month <= l.term_to_months &&
                                amountForProduct >= parseFloat(l.amount_from) &&
                                amountForProduct <= parseFloat(l.amount_to)
                            ) || yields[0];

                            initialCapitalComposition.push({
                                product_id: product.id,
                                product_name: product.name,
                                product_type: product.product_type,
                                share_percent: item.share_percent,
                                amount: Math.round(amountForProduct * 100) / 100,
                                yield_percent: line ? parseFloat(line.yield_percent) : 0
                            });
                        }


                        // TopUp Allocation calculation will be done AFTER recommendedReplenishment is finalized
                        // (after PDS adjustment)



                        // Capture Raw Replenishment BEFORE PDS adjustment
                        // Сохраняем «сырое» пополнение до учета софинансирования ПДС,
                        // чтобы вернуть оба значения (с ПДС и без ПДС)
                        recommendedReplenishmentRaw = recommendedReplenishment;

                        // Если нашли ПДС, рассчитываем эффект софинансирования
                        if (pdsProductId && (pdsShareInitial > 0 || pdsShareTopUp > 0)) {
                            try {
                                const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;
                                const startDate = goal.start_date ? new Date(goal.start_date) : new Date();

                                pdsCofinancingResult = await pdsCofinancingService.calculateCofinancingEffect({
                                    capitalGap: CapitalGap,
                                    initialReplenishment: recommendedReplenishment,
                                    initialCapital: InitialCapital,
                                    pdsShareInitial: pdsShareInitial,
                                    pdsShareTopUp: pdsShareTopUp,
                                    pdsProductId: pdsProductId,
                                    termMonths: Month,
                                    avgMonthlyIncome: avgMonthlyIncome,
                                    startDate: startDate,
                                    monthlyGrowthRate: m_month_decimal,
                                    portfolioYieldMonthly: d_month_decimal,
                                    usedCofinancingPerYear
                                });

                                if (pdsCofinancingResult.pds_applied) {
                                    recommendedReplenishment = pdsCofinancingResult.recommendedReplenishment;
                                    // Обновляем использованное софинансирование
                                    if (pdsCofinancingResult.actualUsedCofinancingPerYear) {
                                        for (const yr in pdsCofinancingResult.actualUsedCofinancingPerYear) {
                                            usedCofinancingPerYear[yr] = (usedCofinancingPerYear[yr] || 0) + pdsCofinancingResult.actualUsedCofinancingPerYear[yr];
                                        }
                                    }
                                }
                            } catch (pdsError) {
                                console.error('PDS cofinancing calculation error for passive income:', pdsError);
                            }
                        }


                        // --- FINAL TOP-UP COMPOSITION BUILD ---
                        // Now that recommendedReplenishment is finalized (potentially reduced by PDS), we build the composition
                        let topUpDist = topUpDistribution;
                        if (!topUpDist.length && capitalDistribution.length > 0) topUpDist = capitalDistribution; // Fallback

                        for (const item of topUpDist) {
                            const product = await productRepository.findById(item.product_id);
                            if (!product) continue;
                            topUpComposition.push({
                                product_id: product.id,
                                product_name: product.name,
                                product_type: product.product_type,
                                share_percent: item.share_percent,
                                amount: Math.round((recommendedReplenishment * (item.share_percent / 100)) * 100) / 100,
                                yield_percent: null
                            });
                        }
                    }

                    // Формируем результат
                    const resultItem = {
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'PASSIVE_INCOME',
                        passive_income_calculation: {
                            desired_monthly_income_initial: Math.round(goal.target_amount * 100) / 100,
                            desired_monthly_income_with_inflation: Math.round(desiredMonthlyIncomeWithInflation * 100) / 100,
                            required_capital: Math.round(requiredCapital * 100) / 100,
                            yield_percent: Math.round(yieldPercent * 100) / 100,
                            yield_line: {
                                min_term_months: yieldLine.min_term_months,
                                max_term_months: yieldLine.max_term_months,
                                min_amount: yieldLine.min_amount,
                                max_amount: yieldLine.max_amount
                            }
                        },
                        financials: {
                            cost_initial: Math.round(Cost * 100) / 100,
                            cost_with_inflation: Math.round(CostWithInflation * 100) / 100,
                            inflation_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                            investment_expense_growth_monthly_percent: m_month_percent,
                            investment_expense_growth_annual_percent: Math.round(((Math.pow(1 + m_month_decimal, 12) - 1) * 100) * 100) / 100,
                            initial_capital: InitialCapital,
                            capital_gap: Math.round(CapitalGap * 100) / 100,
                            recommended_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            portfolio_yield_annual_percent: Math.round(d_annual * 100) / 100
                        },
                        // --- UNIFIED BLOCKS ---
                        summary: {
                            goal_type: 'PASSIVE_INCOME',
                            status: CapitalGap > 0 ? 'GAP' : 'OK',
                            initial_capital: Math.round(effectiveInitialCapital * 100) / 100,
                            monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                            // For Passive Income, "Total Capital" is "Required Capital" to generate income
                            total_capital_at_end: Math.round(requiredCapital * 100) / 100,
                            target_achieved: CapitalGap <= 0,
                            projected_value: Math.round(desiredMonthlyIncomeWithInflation * 100) / 100, // Monthly income
                            // If PDS applied, we can show state contribution benefit to gap? 
                            // Currently PDS logic "covers" gap by reducing replenishment.
                            // State benefit in accumulated capital can be inferred from Total Cofinancing.
                            state_benefit: (pdsCofinancingResult && pdsCofinancingResult.pds_applied)
                                ? Math.round(pdsCofinancingResult.total_cofinancing_with_investment * 100) / 100
                                : 0
                        },
                        portfolio_structure: {
                            risk_profile: goal.risk_profile || 'BALANCED',
                            portfolio_yield_annual: Math.round(d_annual * 100) / 100,
                            inflation_rate_used: inflationAnnualUsed,
                            portfolio_composition: {
                                initial_capital_allocation: portfolio ? initialCapitalComposition : [],
                                monthly_topup_allocation: portfolio ? topUpComposition : []
                            }
                        }
                    };

                    // Add PDS data if available
                    if (pdsCofinancingResult && pdsCofinancingResult.pds_applied) {
                        resultItem.pds_cofinancing = {
                            cofinancing_next_year: pdsCofinancingResult.cofinancing_next_year,
                            total_cofinancing_nominal: pdsCofinancingResult.total_cofinancing_nominal,
                            total_cofinancing_with_investment: pdsCofinancingResult.total_cofinancing_with_investment,
                            pds_yield_annual_percent: pdsCofinancingResult.pds_yield_annual_percent,
                            new_capital_gap: pdsCofinancingResult.new_capital_gap,
                            yearly_breakdown: pdsCofinancingResult.yearly_breakdown
                        };
                    }

                    resultsIndexed.push({ index, result: resultItem });
                    continue;
                } catch (passiveIncomeError) {
                    console.error('Passive income calculation error:', passiveIncomeError);
                    resultsIndexed.push({
                        index, result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PASSIVE_INCOME',
                            error: `Passive income calculation failed: ${passiveIncomeError.message || 'Unknown error'}`,
                            error_details: passiveIncomeError
                        }
                    });
                    continue;
                }
            }

            // Если это цель типа PENSION, используем специальную логику расчета
            if (isPensionGoal) {
                console.log('=== PENSION CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);
                console.log('Target monthly pension:', goal.target_amount, 'Term months:', goal.term_months);

                try {
                    // Проверяем наличие необходимых данных клиента
                    if (!client || !client.birth_date) {
                        resultsIndexed.push({
                            index, result: {
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'PENSION',
                                error: 'Client birth_date is required for pension calculation'
                            }
                        });
                        continue;
                    }

                    // Получаем системные настройки пенсии
                    const pensionSettings = {
                        pension_pfr_contribution_rate_part1: 22,
                        pension_fixed_payment: 8907,
                        pension_point_cost: 145.69,
                        pension_max_salary_limit: 2759000,
                        pension_ipk_past_coef: 0.6,
                        inflation_rate: goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent
                    };

                    try {
                        const settingPfr1 = await settingsService.get('pension_pfr_contribution_rate_part1');
                        if (settingPfr1) pensionSettings.pension_pfr_contribution_rate_part1 = settingPfr1.value;
                    } catch (e) { console.warn('Could not fetch pension_pfr_contribution_rate_part1'); }

                    try {
                        const settingFixed = await settingsService.get('pension_fixed_payment');
                        if (settingFixed) pensionSettings.pension_fixed_payment = settingFixed.value;
                    } catch (e) { console.warn('Could not fetch pension_fixed_payment'); }

                    try {
                        const settingPoint = await settingsService.get('pension_point_cost');
                        if (settingPoint) pensionSettings.pension_point_cost = settingPoint.value;
                    } catch (e) { console.warn('Could not fetch pension_point_cost'); }

                    try {
                        const settingMax = await settingsService.get('pension_max_salary_limit');
                        if (settingMax) pensionSettings.pension_max_salary_limit = settingMax.value;
                    } catch (e) { console.warn('Could not fetch pension_max_salary_limit'); }

                    try {
                        const settingCoef = await settingsService.get('pension_ipk_past_coef');
                        if (settingCoef) pensionSettings.pension_ipk_past_coef = settingCoef.value;
                    } catch (e) { console.warn('Could not fetch pension_ipk_past_coef'); }

                    // Получаем avg_monthly_income из client (приоритет) или goal
                    const clientWithIncome = {
                        ...client,
                        avg_monthly_income: client.avg_monthly_income || goal.avg_monthly_income || 0
                    };

                    // Рассчитываем прогнозную госпенсию
                    const nowDate = new Date();
                    const statePensionResult = await this.calculateStatePension(clientWithIncome, pensionSettings, nowDate);

                    console.log('State pension calculation result:', statePensionResult);

                    // Определяем срок до пенсии: если term_months не задан или 0, используем years_to_pension * 12
                    const termMonthsForCalculation = (goal.term_months && goal.term_months > 0)
                        ? goal.term_months
                        : statePensionResult.years_to_pension * 12;

                    // Рассчитываем желаемую пенсию в будущем (с учетом инфляции)
                    // Используем years_to_pension для индексации, так как это срок до выхода на пенсию
                    const inflationAnnualUsed = pensionSettings.inflation_rate;
                    const infl_month_decimal = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;
                    const monthsToPension = statePensionResult.years_to_pension * 12;
                    const desiredPensionMonthlyFuture = goal.target_amount * Math.pow(1 + infl_month_decimal, monthsToPension);

                    // Дефицит пенсии
                    const pensionGapMonthlyFuture = Math.max(desiredPensionMonthlyFuture - statePensionResult.state_pension_monthly_future, 0);

                    console.log('Desired pension (initial):', goal.target_amount);
                    console.log('Desired pension (with inflation):', desiredPensionMonthlyFuture);
                    console.log('State pension (future):', statePensionResult.state_pension_monthly_future);
                    console.log('Pension gap (future):', pensionGapMonthlyFuture);

                    // Если дефицита нет, возвращаем результат без расчета капитала
                    if (pensionGapMonthlyFuture <= 0) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            state_pension: {
                                ipk_est: statePensionResult.ipk_est,
                                state_pension_monthly_future: statePensionResult.state_pension_monthly_future,
                                state_pension_monthly_current: statePensionResult.state_pension_monthly_current,
                                retirement_age: statePensionResult.retirement_age,
                                retirement_year: statePensionResult.retirement_year,
                                years_to_pension: statePensionResult.years_to_pension
                            },
                            desired_pension: {
                                desired_monthly_income_initial: Math.round(goal.target_amount * 100) / 100,
                                desired_monthly_income_with_inflation: Math.round(desiredPensionMonthlyFuture * 100) / 100
                            },
                            pension_gap: {
                                gap_monthly_future: 0,
                                has_gap: false
                            },
                            message: 'Госпенсия покрывает желаемую пенсию, дополнительный капитал не требуется'
                        });
                        continue;
                    }

                    // Если есть дефицит, рассчитываем через PASSIVE_INCOME логику
                    // Приводим дефицит в ценах сегодня (дисконтируем)
                    const pensionGapMonthlyCurrent = pensionGapMonthlyFuture / Math.pow(1 + (inflationAnnualUsed / 100), statePensionResult.years_to_pension);

                    // Создаем виртуальную цель пассивного дохода
                    const virtualPassiveIncomeGoal = {
                        goal_type_id: 1, // Используем портфель класса "пенсия" (id=1)
                        name: 'Пенсия (дефицит)',
                        target_amount: pensionGapMonthlyCurrent, // Желаемый доход в месяц (в ценах сегодня)
                        term_months: statePensionResult.years_to_pension * 12, // Срок до выхода на пенсию
                        risk_profile: goal.risk_profile,
                        initial_capital: goal.initial_capital || 0,
                        inflation_rate: inflationAnnualUsed,
                        avg_monthly_income: clientWithIncome.avg_monthly_income,
                        start_date: goal.start_date
                    };

                    console.log('Virtual passive income goal for pension gap:', virtualPassiveIncomeGoal);

                    // Используем логику PASSIVE_INCOME для расчета дефицита
                    const infl_month_decimal_pi = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;
                    const desiredMonthlyIncomeWithInflation = virtualPassiveIncomeGoal.target_amount * Math.pow(1 + infl_month_decimal_pi, virtualPassiveIncomeGoal.term_months);

                    // 1. РАСЧЕТ ЦЕЛЕВОГО КАПИТАЛА (Payout Phase)
                    // Для этого используем настройки доходности "Пассивного дохода" (глобальные)
                    // Потому что мы считаем, какой капитал нам нужен, чтобы жить на проценты
                    const payoutYieldLine = await settingsService.findPassiveIncomeYieldLine(0, virtualPassiveIncomeGoal.term_months, true);

                    if (!payoutYieldLine) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            error: `No passive income yield line found for term ${virtualPassiveIncomeGoal.term_months} months to calculate required capital`
                        });
                        continue;
                    }

                    const payoutYieldPercent = parseFloat(payoutYieldLine.yield_percent);

                    // Расчет необходимого капитала: (MonthlyIncome * 12 * 100) / PayoutYield
                    const requiredCapital = (desiredMonthlyIncomeWithInflation * 12 * 100) / payoutYieldPercent;

                    console.log('Pension Payout Calc:', {
                        desiredMonthlyIncomeWithInflation,
                        payoutYieldPercent,
                        requiredCapital
                    });


                    // 2. РАСЧЕТ НАКОПЛЕНИЯ (Accumulation Phase)
                    // Для этого ищем портфель "Пенсия" и считаем доходность его продуктов
                    const portfolioForAcc = await portfolioRepository.findByCriteria({
                        classId: 1,
                        amount: goal.initial_capital || 0,
                        term: virtualPassiveIncomeGoal.term_months
                    });

                    if (!portfolioForAcc) {
                        resultsIndexed.push({
                            index, result: {
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'PENSION',
                                error: `No portfolio found (Class 1) to determine accumulation yield`
                            }
                        });
                        continue;
                    }

                    // Получаем доходность из риск-профиля портфеля
                    let riskProfilesYield = portfolioForAcc.risk_profiles;
                    if (typeof riskProfilesYield === 'string') {
                        try { riskProfilesYield = JSON.parse(riskProfilesYield); } catch (e) { riskProfilesYield = []; }
                    }
                    const profileYield = riskProfilesYield.find(p => p.profile_type === goal.risk_profile);

                    if (!profileYield) {
                        console.log('--- DEBUG RISK PROFILE FAIL ---');
                        console.log('Goal object:', JSON.stringify(goal, null, 2));
                        console.log('Goal Risk Profile:', goal.risk_profile);
                        console.log('Portfolio Risk Profiles Types:', riskProfilesYield.map(p => p.profile_type));
                    }

                    if (!profileYield) {
                        resultsIndexed.push({
                            index, result: {
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'PENSION',
                                error: `Risk profile ${goal.risk_profile} not found in pension portfolio`
                            }
                        });
                        continue;
                    }

                    // Считаем средневзвешенную доходность портфеля (для накопления)
                    let weightedYieldAnnual = 0;

                    // Support both legacy (initial_capital) and new (instruments) formats
                    let capitalDistributionYield = profileYield.initial_capital;
                    if (!capitalDistributionYield && profileYield.instruments) {
                        capitalDistributionYield = profileYield.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                    }
                    capitalDistributionYield = capitalDistributionYield || [];

                    for (const item of capitalDistributionYield) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        // Calculate allocated amount for this product
                        const initialCap = goal.initial_capital || 0;
                        let allocatedAmount = initialCap * (item.share_percent / 100);
                        if (allocatedAmount === 0) allocatedAmount = 1;

                        const yields = product.yields || [];

                        // Find line matching BOTH Term AND Amount
                        const line = yields.find(l =>
                            virtualPassiveIncomeGoal.term_months >= l.term_from_months &&
                            virtualPassiveIncomeGoal.term_months <= l.term_to_months &&
                            allocatedAmount >= parseFloat(l.amount_from) &&
                            allocatedAmount <= parseFloat(l.amount_to)
                        );

                        const effectiveLine = line || yields.find(l =>
                            virtualPassiveIncomeGoal.term_months >= l.term_from_months &&
                            virtualPassiveIncomeGoal.term_months <= l.term_to_months
                        ) || yields[0];

                        const productYield = effectiveLine ? parseFloat(effectiveLine.yield_percent) : 0;

                        weightedYieldAnnual += (productYield * (item.share_percent / 100));
                    }

                    const accumulationYieldPercent = weightedYieldAnnual;

                    const termMonthsPensionAccum = virtualPassiveIncomeGoal.term_months;
                    const initialCapitalPension = goal.initial_capital || 0;
                    const targetCapitalPension = requiredCapital;
                    const inflationMonthlyPension = infl_month_decimal_pi;
                    const yieldMonthlyPension = Math.pow(1 + (accumulationYieldPercent / 100), 1 / 12) - 1;

                    // --- NEW: ASSET ALLOCATION ---
                    const { fixedInflows, sharedInflowsTaken, allInflows } = this._getGoalInflows(
                        goal, assets, sharedPoolEvents, termMonthsPensionAccum, initialCapitalPension, targetCapitalPension, yieldMonthlyPension, inflationMonthlyPension, 0
                    );

                    // Solve for recommendedReplenishment using simulation
                    let recommendedReplenishment = await this._simulateGoal({
                        initialCapital: initialCapitalPension,
                        targetAmountFuture: targetCapitalPension,
                        termMonths: termMonthsPensionAccum,
                        monthlyYieldRate: yieldMonthlyPension,
                        monthlyInflationRate: m_month_percent / 100, // Use system indexation (0.33%)
                        inflows: allInflows
                    });

                    // For legacy summary logic
                    const InitialCapital = initialCapitalPension;
                    const Month = termMonthsPensionAccum;
                    const CostWithInflation = targetCapitalPension;
                    const d_month_decimal = yieldMonthlyPension;
                    // infl_month_decimal already defined above at 1104 or 1161

                    const CapitalGap = Math.max(0, CostWithInflation - (InitialCapital * Math.pow(1 + d_month_decimal, Month)));
                    const recommendedReplenishmentRaw = recommendedReplenishment;

                    // Use system setting for monthly indexation (from investment_expense_growth_monthly, e.g. 0.33)
                    const m_month_decimal = m_month_percent / 100;
                    const Cost = (targetCapitalPension / Math.pow(1 + infl_month_decimal, Month));

                    const sharedInitial = sharedInflowsTaken
                        .filter(i => i.month === 0)
                        .reduce((sum, i) => sum + i.amount, 0);
                    const effectiveInitialCapital = InitialCapital + sharedInitial;

                    // Используем тот же портфель для проверки ПДС
                    const portfolio = portfolioForAcc;


                    let pdsCofinancingResult = null;
                    const initialCapitalComposition = [];
                    const topUpComposition = [];

                    if (portfolio) {
                        let riskProfiles = portfolio.risk_profiles;
                        if (typeof riskProfiles === 'string') {
                            try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
                        }

                        const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile);

                        if (profile) {
                            // Support both legacy and new formats
                            let capitalDistribution = profile.initial_capital;
                            if (!capitalDistribution && profile.instruments) {
                                capitalDistribution = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                            }
                            capitalDistribution = capitalDistribution || [];

                            let pdsProductId = null;
                            let pdsShareInitial = 0;
                            let pdsShareTopUp = 0;



                            for (const item of capitalDistribution) {
                                const product = await productRepository.findById(item.product_id);
                                if (!product) continue;

                                // Check for PDS
                                if (product.product_type === 'PDS') {
                                    pdsProductId = product.id;
                                    pdsShareInitial = item.share_percent;
                                }

                                // Build Composition
                                const amountForProduct = Math.max(InitialCapital * (item.share_percent / 100), 1);
                                const yields = product.yields || [];
                                const line = yields.find(l =>
                                    Month >= l.term_from_months &&
                                    Month <= l.term_to_months &&
                                    amountForProduct >= parseFloat(l.amount_from) &&
                                    amountForProduct <= parseFloat(l.amount_to)
                                ) || yields[0];

                                initialCapitalComposition.push({
                                    product_id: product.id,
                                    product_name: product.name,
                                    product_type: product.product_type,
                                    share_percent: item.share_percent,
                                    amount: Math.round(amountForProduct * 100) / 100,
                                    yield_percent: line ? parseFloat(line.yield_percent) : 0
                                });
                            }

                            // Build TopUp Composition
                            let topUpDistForComp = profile.top_up;
                            if (!topUpDistForComp && profile.instruments) {
                                topUpDistForComp = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                            }
                            if ((!topUpDistForComp || !topUpDistForComp.length) && (capitalDistribution && capitalDistribution.length > 0)) {
                                topUpDistForComp = capitalDistribution; // Fallback
                            }
                            topUpDistForComp = topUpDistForComp || [];

                            if (!pdsProductId) {
                                // Search for PDS in top-up if not found in initial
                                for (const item of topUpDistForComp) {
                                    const product = await productRepository.findById(item.product_id);
                                    if (product && product.product_type === 'PDS') {
                                        pdsProductId = product.id;
                                        break;
                                    }
                                }
                            }

                            for (const item of topUpDistForComp) {
                                const product = await productRepository.findById(item.product_id);
                                if (!product) continue;
                                // Check if this is PDS to set share
                                if (pdsProductId && item.product_id == pdsProductId) {
                                    pdsShareTopUp = item.share_percent;
                                }

                                topUpComposition.push({
                                    product_id: product.id,
                                    product_name: product.name,
                                    product_type: product.product_type,
                                    share_percent: item.share_percent,
                                    amount: Math.round((recommendedReplenishment * (item.share_percent / 100)) * 100) / 100,
                                    yield_percent: null
                                });
                            }

                            if (pdsProductId && !pdsShareTopUp && pdsShareInitial) {
                                pdsShareTopUp = pdsShareInitial;
                            }


                            if (pdsProductId && (pdsShareInitial > 0 || pdsShareTopUp > 0)) {
                                try {
                                    const avgMonthlyIncome = clientWithIncome.avg_monthly_income || 0;
                                    const startDate = virtualPassiveIncomeGoal.start_date ? new Date(virtualPassiveIncomeGoal.start_date) : new Date();

                                    pdsCofinancingResult = await pdsCofinancingService.calculateCofinancingEffect({
                                        capitalGap: CapitalGap,
                                        initialReplenishment: recommendedReplenishment,
                                        initialCapital: InitialCapital,
                                        pdsShareInitial: pdsShareInitial,
                                        pdsShareTopUp: pdsShareTopUp,
                                        pdsProductId: pdsProductId,
                                        termMonths: Month,
                                        avgMonthlyIncome: avgMonthlyIncome,
                                        startDate: startDate,
                                        monthlyGrowthRate: m_month_decimal,
                                        portfolioYieldMonthly: d_month_decimal,
                                        usedCofinancingPerYear
                                    });

                                    if (pdsCofinancingResult.pds_applied) {
                                        recommendedReplenishment = pdsCofinancingResult.recommendedReplenishment;
                                        // Обновляем использованное софинансирование
                                        if (pdsCofinancingResult.actualUsedCofinancingPerYear) {
                                            for (const yr in pdsCofinancingResult.actualUsedCofinancingPerYear) {
                                                usedCofinancingPerYear[yr] = (usedCofinancingPerYear[yr] || 0) + pdsCofinancingResult.actualUsedCofinancingPerYear[yr];
                                            }
                                        }
                                    }
                                } catch (pdsError) {
                                    console.error('PDS cofinancing calculation error for pension:', pdsError);
                                }
                            }
                        }
                    }

                    // Формируем результат для цели "Пенсия"
                    const resultItem = {
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'PENSION',
                        state_pension: {
                            ipk_est: statePensionResult.ipk_est,
                            state_pension_monthly_future: statePensionResult.state_pension_monthly_future,
                            state_pension_monthly_current: statePensionResult.state_pension_monthly_current,
                            retirement_age: statePensionResult.retirement_age,
                            retirement_year: statePensionResult.retirement_year,
                            years_to_pension: statePensionResult.years_to_pension,
                            years_of_work: statePensionResult.years_of_work,
                            age: statePensionResult.age
                        },
                        desired_pension: {
                            desired_monthly_income_initial: Math.round(goal.target_amount * 100) / 100,
                            desired_monthly_income_with_inflation: Math.round(desiredPensionMonthlyFuture * 100) / 100
                        },
                        pension_gap: {
                            gap_monthly_future: Math.round(pensionGapMonthlyFuture * 100) / 100,
                            gap_monthly_current: Math.round(pensionGapMonthlyCurrent * 100) / 100,
                            has_gap: true
                        },
                        passive_income_calculation: {
                            desired_monthly_income_initial: Math.round(pensionGapMonthlyCurrent * 100) / 100,
                            desired_monthly_income_with_inflation: Math.round(desiredMonthlyIncomeWithInflation * 100) / 100,
                            required_capital: Math.round(requiredCapital * 100) / 100,
                            yield_percent: Math.round(payoutYieldPercent * 100) / 100
                            // yield_line removed as we use portfolio average yield
                        },
                        financials: {
                            cost_initial: Math.round(Cost * 100) / 100,
                            cost_with_inflation: Math.round(CostWithInflation * 100) / 100,
                            inflation_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                            investment_expense_growth_monthly_percent: Math.round(infl_month_decimal * 100 * 100) / 100,
                            investment_expense_growth_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                            initial_capital: InitialCapital,
                            capital_gap: Math.round(CapitalGap * 100) / 100,
                            // with/without PDS replenishments
                            recommended_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            recommended_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                        },
                        // --- UNIFIED BLOCKS ---
                        summary: {
                            goal_type: 'PENSION',
                            status: CapitalGap > 0 ? 'GAP' : 'OK',
                            initial_capital: Math.round(effectiveInitialCapital * 100) / 100,
                            monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                            total_capital_at_end: Math.round(CostWithInflation * 100) / 100, // Capital needed at retirement
                            target_achieved: true, // Assuming recommendations are followed
                            projected_value: Math.round(desiredPensionMonthlyFuture * 100) / 100, // Monthly Pension
                            state_benefit: (pdsCofinancingResult && pdsCofinancingResult.pds_applied)
                                ? Math.round(pdsCofinancingResult.total_cofinancing_with_investment * 100) / 100
                                : 0
                        },
                        portfolio_structure: {
                            risk_profile: goal.risk_profile || 'BALANCED',
                            portfolio_yield_annual: Math.round(accumulationYieldPercent * 100) / 100,
                            inflation_rate_used: inflationAnnualUsed,
                            portfolio_composition: {
                                initial_capital_allocation: initialCapitalComposition,
                                monthly_topup_allocation: topUpComposition
                            }
                        }
                    };

                    // Добавляем данные по софинансированию ПДС, если применимо
                    if (pdsCofinancingResult && pdsCofinancingResult.pds_applied) {
                        resultItem.pds_cofinancing = {
                            cofinancing_next_year: pdsCofinancingResult.cofinancing_next_year,
                            total_cofinancing_nominal: pdsCofinancingResult.total_cofinancing_nominal,
                            total_cofinancing_with_investment: pdsCofinancingResult.total_cofinancing_with_investment,
                            pds_yield_annual_percent: pdsCofinancingResult.pds_yield_annual_percent,
                            new_capital_gap: pdsCofinancingResult.new_capital_gap,
                            yearly_breakdown: pdsCofinancingResult.yearly_breakdown
                        };
                    }

                    resultsIndexed.push({ index, result: resultItem });
                    continue; // Пропускаем обычный расчет для PENSION
                } catch (pensionError) {
                    console.error('Pension calculation error:', pensionError);
                    resultsIndexed.push({
                        index, result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            error: `Pension calculation failed: ${pensionError.message || 'Unknown error'}`,
                            error_details: pensionError
                        }
                    });
                    continue;
                }
            }



            // --- INVESTMENT PROJECTION LOGIC (ID=3) ---
            if (goal.goal_type_id == 3) {
                try {
                    // 1. Find Portfolio (Class 3)
                    const portfolio = await portfolioRepository.findByCriteria({
                        classId: 3,
                        amount: goal.initial_capital || 0,
                        term: goal.term_months
                    });

                    if (!portfolio) {
                        resultsIndexed.push({
                            index, result: {
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'INVESTMENT',
                                error: 'Portfolio not found for investment criteria'
                            }
                        });
                        continue;
                    }

                    // 2. Determine Weighted Yield
                    let riskProfiles = portfolio.risk_profiles;
                    if (typeof riskProfiles === 'string') {
                        try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
                    }
                    const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile);

                    if (!profile) {
                        resultsIndexed.push({
                            index, result: {
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'INVESTMENT',
                                error: `Risk profile ${goal.risk_profile} not found`
                            }
                        });
                        continue;
                    }

                    let weightedYieldAnnual = 0;
                    // Support both legacy (initial_capital) and new (instruments) formats
                    let capitalDistribution = profile.initial_capital;
                    if (!capitalDistribution && profile.instruments) {
                        capitalDistribution = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                    }
                    capitalDistribution = capitalDistribution || [];

                    // Check for PDS in valid products
                    let pdsProductId = null;

                    for (const item of capitalDistribution) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        if (product.product_type === 'PDS') {
                            pdsProductId = product.id;
                        }

                        // Determine yield for product
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

                    const portfolioYieldAnnual = weightedYieldAnnual;
                    const portfolioYieldMonthly = Math.pow(1 + (portfolioYieldAnnual / 100), 1 / 12) - 1;

                    // 3. Projection Simulation
                    let currentBalance = goal.initial_capital || 0;
                    let totalClientInvestment = goal.initial_capital || 0;
                    let totalStateBenefit = 0;
                    let totalInvestmentIncome = 0; // Will be calculated as diff

                    const monthlyReplenishment = goal.monthly_replenishment || 0;
                    const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
                    const monthlyInflation = Math.pow(1 + (inflationRate / 100), 1 / 12) - 1;

                    // PDS Helpers
                    const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
                    const startYear = startDate.getFullYear();
                    const startMonth = startDate.getMonth() + 1; // 1-12
                    const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;

                    // Track yearly contributions for PDS limits
                    const yearlyContributions = {};
                    // Add initial capital to first year? Only if it counts as connection. 
                    // Usually initial capital is lump sum, but let's assume it counts for PDS limit check if made in current year.
                    if (goal.initial_capital > 0) {
                        yearlyContributions[startYear] = (yearlyContributions[startYear] || 0) + goal.initial_capital;
                    }

                    // Loop months
                    let currentDate = new Date(startDate);

                    for (let m = 0; m < goal.term_months; m++) {
                        const year = currentDate.getFullYear();
                        const month = currentDate.getMonth() + 1;

                        // 3.1 Investment Growth
                        const growth = currentBalance * portfolioYieldMonthly;
                        currentBalance += growth;

                        // 3.2 Monthly Top-Up (Indexation option could be added here, currently simplified const or simple inflation)
                        // Assuming valid monthly replenishment stays constant in real terms? 
                        // Or nominal? Usually nominal unless "indexation" checked. 
                        // Let's assume nominal for input flexibility, or indexed?
                        // Standard logic uses 'm_month_percent' for growth. Let's assume it grows with inflation to keep real value.
                        // 3.2 Monthly Top-Up (Ordered by User: use 'investment_expense_growth_monthly' for indexation)
                        // This parameter is stored in 'm_month_percent' (fetched at start of function)
                        // It is usually a percent like 0.33, so we divide by 100 for calculation.
                        // However, if user overrides inflation_rate in Goal, should we use that?
                        // User request: "у нас етсь такой парамтер investment_expense_growth_monthly"
                        // Let's use m_month_percent. Note: m_month_percent is usually e.g. 0.33
                        const indexationRate = (m_month_percent || 0) / 100;
                        const indexedReplenishment = monthlyReplenishment * Math.pow(1 + indexationRate, m);

                        currentBalance += indexedReplenishment;
                        totalClientInvestment += indexedReplenishment;
                        yearlyContributions[year] = (yearlyContributions[year] || 0) + indexedReplenishment;

                        // 3.3 PDS Co-financing (August)
                        // Logic: In August, we get co-financing for Previous Year
                        if (pdsProductId && month === 8 && year > startYear) { // 8 = August
                            const prevYear = year - 1;
                            // Check if we are within 10 years of program
                            if (prevYear - startYear < 10 && yearlyContributions[prevYear]) {
                                // Calculate State Benefit
                                const cofinResult = await settingsService.calculatePdsCofinancing(
                                    yearlyContributions[prevYear],
                                    avgMonthlyIncome,
                                    36000 // Limit per year. Assuming 36000 available for this goal.
                                );
                                const benefit = cofinResult.state_cofin_amount || 0;
                                if (benefit > 0) {
                                    currentBalance += benefit;
                                    totalStateBenefit += benefit;
                                }
                            }
                        }

                        // Next month
                        currentDate.setMonth(currentDate.getMonth() + 1);
                    }

                    totalInvestmentIncome = currentBalance - totalClientInvestment - totalStateBenefit;

                    // Result Construction
                    resultsIndexed.push({
                        index, result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'INVESTMENT',
                            projected_value: Math.round(currentBalance * 100) / 100,
                            total_client_investment: Math.round(totalClientInvestment * 100) / 100,
                            total_investment_income: Math.round(totalInvestmentIncome * 100) / 100,
                            total_state_benefit: Math.round(totalStateBenefit * 100) / 100,
                            yield_annual_percent: Math.round(portfolioYieldAnnual * 100) / 100,
                            term_months: goal.term_months,
                            portfolio_name: portfolio.name,
                            // Legacy structure fields for compatibility if frontend expects them
                            summary: {
                                status: 'OK',
                                projected_value: Math.round(currentBalance * 100) / 100,
                                target_achieved: true
                            }
                        }
                    });
                    continue;

                } catch (invError) {
                    console.error('Investment calculation error:', invError);
                    resultsIndexed.push({
                        index, result: {
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            error: 'Investment calculation failed'
                        }
                    });
                    continue;
                }
            }

            // --- Step 1: Find Portfolio (для обычных целей) ---
            const portfolio = await portfolioRepository.findByCriteria({
                classId: goal.goal_type_id,
                amount: goal.initial_capital || 0, // Используем первоначальный капитал для выбора портфеля
                term: goal.term_months
            });

            if (!portfolio) {
                resultsIndexed.push({
                    index, result: {
                        goal_name: goal.name,
                        error: 'Portfolio not found for specified criteria'
                    }
                });
                continue;
            }

            let riskProfiles = portfolio.risk_profiles;
            if (typeof riskProfiles === 'string') {
                try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
            }

            // --- Step 2: Determine Risk Profile & Weighted Yield ---
            const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile);

            if (!profile) {
                resultsIndexed.push({
                    index, result: {
                        goal_name: goal.name,
                        error: `Risk profile ${goal.risk_profile} not found in portfolio ${portfolio.name}`
                    }
                });
                continue;
            }

            // Calculate weighted yield (d)
            let weightedYieldAnnual = 0;
            const productDetails = [];
            const initialCapitalComposition = [];
            const topUpComposition = [];

            // Support both legacy (initial_capital) and new (instruments) formats
            let capitalDistribution = profile.initial_capital;
            if (!capitalDistribution && profile.instruments) {
                capitalDistribution = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
            }
            capitalDistribution = capitalDistribution || [];

            for (const item of capitalDistribution) {
                const product = await productRepository.findById(item.product_id);
                if (!product) continue;

                // Логирование для отладки
                console.log('=== PRODUCT DEBUG ===');
                console.log('Product ID:', product.id);
                console.log('Product name:', product.name);
                console.log('Product type:', product.product_type);
                console.log('Product type check (=== "PDS"):', product.product_type === 'PDS');
                console.log('Full product object:', JSON.stringify(product, null, 2));

                // Amount allocated to this product
                const allocatedAmount = (goal.initial_capital || 0) * (item.share_percent / 100);

                // Find matching yield line
                let nominalAmountToCheck = allocatedAmount;
                if (nominalAmountToCheck === 0) nominalAmountToCheck = 1;

                // product.yields содержит массив доходностей с полями:
                // term_from_months, term_to_months, amount_from, amount_to, yield_percent
                const yields = product.yields || [];

                if (yields.length === 0) {
                    console.warn(`Product ${product.id} (${product.name}) has no yields configured`);
                }

                const line = yields.find(l =>
                    nominalAmountToCheck >= parseFloat(l.amount_from) &&
                    nominalAmountToCheck <= parseFloat(l.amount_to) &&
                    goal.term_months >= l.term_from_months &&
                    goal.term_months <= l.term_to_months
                );

                const effectiveLine = line || yields[0]; // Simplification/Fallback

                const productYield = effectiveLine ? parseFloat(effectiveLine.yield_percent) : 0;

                if (productYield === 0 && yields.length > 0) {
                    console.warn(`Product ${product.id} (${product.name}) yield is 0 or not found for amount ${nominalAmountToCheck} and term ${goal.term_months} months`);
                }

                weightedYieldAnnual += (productYield * (item.share_percent / 100));

                productDetails.push({
                    product_id: product.id,
                    name: product.name,
                    share_percent: item.share_percent,
                    yield_percent: productYield,
                    matched_line: effectiveLine
                });

                initialCapitalComposition.push({
                    product_id: product.id,
                    product_name: product.name,
                    product_type: product.product_type,
                    share_percent: item.share_percent,
                    amount: Math.round(allocatedAmount * 100) / 100,
                    yield_percent: productYield
                });
            }

            const d_annual = weightedYieldAnnual; // d in year percent

            // Проверка: если доходность портфеля равна 0, это может быть проблемой
            if (d_annual === 0 && capitalDistribution.length > 0) {
                console.warn(`Portfolio ${portfolio.name} has zero yield. Products: ${productDetails.map(p => `${p.name} (${p.yield_percent}%)`).join(', ')}`);
            }

            // --- Step 3: Math ---

            const Cost = goal.target_amount;
            const Month = goal.term_months;
            const InitialCapital = goal.initial_capital || 0;

            // Determine Annual Inflation to use
            const inflationAnnualUsed = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;

            // Decimals Conversion

            // d_month (decimal) from Annual
            const d_month_decimal = Math.pow(1 + (d_annual / 100), 1 / 12) - 1;

            // inflation_month (decimal) from Annual
            const infl_month_decimal = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;

            // m_month (decimal) - ALREADY monthly from settings
            const m_month_decimal = m_month_percent / 100;


            // 1. Cost With Inflation
            // CostWithInflation = Cost * (1 + infl)^month
            const CostWithInflation = Cost * Math.pow(1 + infl_month_decimal, Month);

            // 2. Future Value of Initial Capital
            // (InitialCapital * (1 + d_month)^month)
            const FutureValueInitial = InitialCapital * Math.pow(1 + d_month_decimal, Month);

            // 3. Gap (Capital Shortage)
            const CapitalGap = CostWithInflation - FutureValueInitial;

            // 4. Initial Replenishment
            let recommendedReplenishment = 0;

            if (Math.abs(m_month_decimal - d_month_decimal) < 0.0000001) {
                // Zero-denominator-safe approximation
                recommendedReplenishment = CapitalGap / (Month * Math.pow(1 + d_month_decimal, Month - 1));
            } else {
                const numerator = CapitalGap * (m_month_decimal - d_month_decimal);
                const term1 = 1 + d_month_decimal;
                const term2 = Math.pow(1 + m_month_decimal, Month - 1);
                const term3 = Math.pow(1 + d_month_decimal, Month - 1);
                const denominator = term1 * (term2 - term3);

                if (denominator !== 0) {
                    recommendedReplenishment = numerator / denominator;
                }
            }

            const recommendedReplenishmentRaw = recommendedReplenishment;

            // 5. Расчет эффекта софинансирования ПДС (если есть ПДС в портфеле)
            let pdsCofinancingResult = null;
            let pdsProductId = null;
            let pdsShareInitial = 0;
            let pdsShareTopUp = 0;

            // Ищем ПДС в initial_capital
            console.log('=== PDS SEARCH DEBUG ===');
            console.log('capitalDistribution:', JSON.stringify(capitalDistribution, null, 2));
            for (const item of capitalDistribution) {
                const product = await productRepository.findById(item.product_id);
                console.log(`Checking product ID ${item.product_id}:`, {
                    found: !!product,
                    name: product?.name,
                    product_type: product?.product_type,
                    product_type_raw: JSON.stringify(product?.product_type),
                    isPDS: product?.product_type === 'PDS'
                });
                if (product && product.product_type === 'PDS') {
                    pdsProductId = product.id;
                    pdsShareInitial = item.share_percent;
                    console.log('PDS FOUND! ID:', pdsProductId, 'Share:', pdsShareInitial);
                    break;
                }
            }
            console.log('PDS search result - pdsProductId:', pdsProductId, 'pdsShareInitial:', pdsShareInitial);

            // Ищем ПДС в top_up
            let topUpDistribution = profile.top_up;
            if (!topUpDistribution && profile.instruments) {
                topUpDistribution = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
            }
            topUpDistribution = topUpDistribution || [];

            if (pdsProductId) {
                for (const item of topUpDistribution) {
                    if (item.product_id == pdsProductId) {
                        pdsShareTopUp = item.share_percent;
                        break;
                    }
                }
            } else {
                // Если не нашли в initial, ищем в top_up
                for (const item of topUpDistribution) {
                    const product = await productRepository.findById(item.product_id);
                    if (product && product.product_type === 'PDS') {
                        pdsProductId = product.id;
                        pdsShareTopUp = item.share_percent;
                        break;
                    }
                }
            }
            // Если в top_up нет ПДС, используем долю из initial_capital
            if (pdsProductId && !pdsShareTopUp && pdsShareInitial) {
                pdsShareTopUp = pdsShareInitial;
            }


            // Если нашли ПДС, рассчитываем эффект софинансирования
            if (pdsProductId && (pdsShareInitial > 0 || pdsShareTopUp > 0)) {
                try {
                    // Получаем доход клиента (из goal, client или 0)
                    const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;

                    // Получаем дату начала (из goal или текущая дата)
                    const startDate = goal.start_date ? new Date(goal.start_date) : new Date();

                    pdsCofinancingResult = await pdsCofinancingService.calculateCofinancingEffect({
                        capitalGap: CapitalGap,
                        initialReplenishment: recommendedReplenishment,
                        initialCapital: InitialCapital,
                        pdsShareInitial: pdsShareInitial,
                        pdsShareTopUp: pdsShareTopUp,
                        pdsProductId: pdsProductId,
                        termMonths: Month,
                        avgMonthlyIncome: avgMonthlyIncome,
                        startDate: startDate,
                        monthlyGrowthRate: m_month_decimal,
                        portfolioYieldMonthly: d_month_decimal,
                        usedCofinancingPerYear
                    });

                    // Обновляем рекомендованное пополнение с учетом софинансирования
                    if (pdsCofinancingResult.pds_applied) {
                        recommendedReplenishment = pdsCofinancingResult.recommendedReplenishment;
                        // Обновляем использованное софинансирование
                        if (pdsCofinancingResult.actualUsedCofinancingPerYear) {
                            for (const yr in pdsCofinancingResult.actualUsedCofinancingPerYear) {
                                usedCofinancingPerYear[yr] = (usedCofinancingPerYear[yr] || 0) + pdsCofinancingResult.actualUsedCofinancingPerYear[yr];
                            }
                        }
                    }
                } catch (pdsError) {
                    console.error('PDS cofinancing calculation error:', pdsError);
                    // Продолжаем с исходным расчетом при ошибке
                }
            }

            // Build TopUp Composition (after recommendedReplenishment is calculated)
            let topUpDistForComp = profile.top_up;
            if (!topUpDistForComp && profile.instruments) {
                topUpDistForComp = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
            }
            if ((!topUpDistForComp || !topUpDistForComp.length) && capitalDistribution.length > 0) {
                topUpDistForComp = capitalDistribution; // Fallback
            }
            topUpDistForComp = topUpDistForComp || [];

            for (const item of topUpDistForComp) {
                const product = await productRepository.findById(item.product_id);
                if (!product) continue;
                topUpComposition.push({
                    product_id: product.id,
                    product_name: product.name,
                    product_type: product.product_type,
                    share_percent: item.share_percent,
                    amount: Math.round((recommendedReplenishment || 0) * (item.share_percent / 100) * 100) / 100,
                    yield_percent: null
                });
            }

            const resultItem = {
                goal_id: goal.goal_type_id,
                goal_name: goal.name,
                portfolio: {
                    id: portfolio.id,
                    name: portfolio.name,
                    currency: portfolio.currency
                },
                products: productDetails,
                financials: {
                    cost_initial: Cost,
                    cost_with_inflation: Math.round(CostWithInflation * 100) / 100,
                    inflation_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                    investment_expense_growth_monthly_percent: m_month_percent,
                    // calculated m_annual for reference
                    investment_expense_growth_annual_percent: Math.round(((Math.pow(1 + m_month_decimal, 12) - 1) * 100) * 100) / 100,
                    initial_capital: InitialCapital,
                    capital_gap: Math.round(CapitalGap * 100) / 100,
                    recommended_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                    portfolio_yield_annual_percent: Math.round(d_annual * 100) / 100
                },
                // --- UNIFIED BLOCKS ---
                summary: {
                    goal_type: 'OTHER', // Or generic? Let's use OTHER for now to signify fallback
                    status: CapitalGap > 0 ? 'GAP' : 'OK',
                    initial_capital: InitialCapital,
                    monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                    monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                    total_capital_at_end: Math.round(CostWithInflation * 100) / 100,
                    target_achieved: true,
                    projected_value: Math.round(FutureValueInitial * 100) / 100, // Roughly, actually we want end capital
                    state_benefit: (pdsCofinancingResult && pdsCofinancingResult.pds_applied)
                        ? Math.round(pdsCofinancingResult.total_cofinancing_with_investment * 100) / 100
                        : 0
                },
                portfolio_structure: {
                    risk_profile: goal.risk_profile || 'BALANCED',
                    portfolio_yield_annual: Math.round(d_annual * 100) / 100,
                    inflation_rate_used: inflationAnnualUsed,
                    portfolio_composition: {
                        initial_capital_allocation: initialCapitalComposition,
                        monthly_topup_allocation: topUpComposition
                    }
                }
            };

            // Добавляем данные по софинансированию ПДС, если применимо
            if (pdsCofinancingResult && pdsCofinancingResult.pds_applied) {
                resultItem.pds_cofinancing = {
                    cofinancing_next_year: pdsCofinancingResult.cofinancing_next_year,
                    total_cofinancing_nominal: pdsCofinancingResult.total_cofinancing_nominal,
                    total_cofinancing_with_investment: pdsCofinancingResult.total_cofinancing_with_investment,
                    pds_yield_annual_percent: pdsCofinancingResult.pds_yield_annual_percent,
                    new_capital_gap: pdsCofinancingResult.new_capital_gap,
                    yearly_breakdown: pdsCofinancingResult.yearly_breakdown
                };
            }

            resultsIndexed.push({ index, result: resultItem });
        }

        // Сортируем результаты обратно в соответствии с порядком целей в запросе
        const results = resultsIndexed
            .sort((a, b) => a.index - b.index)
            .map(item => item.result);

        return {
            summary: {
                goals_count: goals.length,
                total_capital: results.reduce((sum, r) => sum + (r.summary?.total_capital_at_end || 0), 0),
                total_state_benefit: results.reduce((sum, r) => sum + (r.summary?.state_benefit || 0), 0)
            },
            goals: results
        };
    }
}

module.exports = new CalculationService();
