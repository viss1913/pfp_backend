const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');
const pdsCofinancingService = require('./pdsCofinancingService');
const TaxService = require('./TaxService');
const pensionCalculator = require('./calculators/PensionCalculator');
const investmentCalculator = require('./calculators/InvestmentCalculator');
const passiveIncomeCalculator = require('./calculators/PassiveIncomeCalculator');
const lifeInsuranceCalculator = require('./calculators/LifeInsuranceCalculator');
const finReserveCalculator = require('./calculators/FinReserveCalculator');
const otherGoalCalculator = require('./calculators/OtherGoalCalculator');
const rentCalculator = require('./calculators/RentCalculator');

const CALCULATORS = {
    1: pensionCalculator,     // PENSION
    2: passiveIncomeCalculator, // PASSIVE_INCOME
    3: investmentCalculator,    // INVESTMENT
    4: otherGoalCalculator,    // HOUSE, CAR, etc.
    5: lifeInsuranceCalculator, // LIFE_INSURANCE
    7: finReserveCalculator,    // FIN_RESERVE
    8: rentCalculator,          // RENT
    9: otherGoalCalculator,      // Map 9 to OTHER
    6: otherGoalCalculator       // Map 6 to OTHER
};

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
            7: 1, // FinReserve (First Priority)
            5: 2, // Life Insurance (Second Priority)
            3: 3, // Investment (Third - Critical for 60% Rule)
            1: 4, // Pension
            2: 5  // Passive Income
        };
        return map[goal.goal_type_id] || 5;
    }

    /**
     * Calculate Life Insurance needed capital via NSJ API
     * @param {Object} goal - Life Insurance goal
     * @param {Object} context - Calculation context
     * @returns {Promise<number>} Required initial capital
     */
    async _calculateLifeInsuranceNeeded(goal, context) {
        const { client, services } = context;
        const { nsjApiService } = services;

        const nsjParams = {
            target_amount: goal.target_amount || 0,
            term_months: goal.term_months || 120,
            client: client || {},
            payment_variant: goal.payment_variant || 12,
            program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test'
        };

        try {
            console.log('[CalculationService] Calling NSJ API for Life goal:', goal.name);
            const result = await nsjApiService.calculateLifeInsurance(nsjParams);
            const isSinglePremium = (goal.payment_variant === 0);

            if (isSinglePremium) {
                console.log('[CalculationService] Life goal needs (single premium):', result.total_premium);
                return result.total_premium || 0;
            } else {
                // For monthly/annual payments, total_premium_rur already represents the periodic premium
                const monthlyPremium = result.total_premium_rur || result.total_premium || 0;
                console.log('[CalculationService] Life goal needs (monthly premium):', monthlyPremium);
                return monthlyPremium;
            }
        } catch (err) {
            console.warn('[CalculationService] NSJ API failed for Life goal, using initial_capital fallback:', err.message);
            return goal.initial_capital || 0;
        }
    }

    async _prepareContext(clientData, options = {}) {
        // Collect assets and pool
        const isFirstRun = options.isFirstRun !== false;
        const usePoolFlag = options.usePool !== false;

        let poolBalance = Number(clientData.total_liquid_capital || 0);
        const assets = clientData.assets || [];

        // Chronological list of shared pool events (unlock_month: 0 is current liquid)
        const sharedPoolEvents = assets
            .filter(a => !a.goal_id)
            // Prevent double-counting: if it's CASH/DEPOSIT at month 0, we assume it's part of total_liquid_capital
            .filter(a => {
                const month = a.unlock_month || a.sell_month || 0;
                const type = (a.type || '').toUpperCase();
                if (month === 0 && (type === 'CASH' || type === 'Наличные')) {
                    return false;
                }
                return true;
            })
            .map(a => ({
                month: a.unlock_month || a.sell_month || 0,
                amount: Number(a.amount || a.current_value || 0)
            }))
            .sort((a, b) => a.month - b.month);

        // Add initial liquid to the start
        sharedPoolEvents.unshift({ month: 0, amount: poolBalance });

        // Fetch System Settings
        const settings = {};
        const allSettingsKeys = [
            'investment_expense_growth_monthly',
            'inflation_rate_year',
            'pension_pfr_contribution_rate_part1',
            'pension_fixed_payment',
            'pension_point_cost',
            'pension_max_salary_limit',
            'pension_ipk_past_coef'
        ];

        for (const key of allSettingsKeys) {
            try {
                const s = await settingsService.get(key);
                settings[key] = s ? s.value : null;
            } catch (e) {
                console.warn(`Could not fetch setting ${key}`);
            }
        }

        const m_month_percent = settings.investment_expense_growth_monthly || 0.0;
        const db_inflation_year_percent = settings.inflation_rate_year || 4.0;


        // Pre-fetch Optimization Data (Cached Settings)
        let pdsSettings = null;
        let pdsBrackets = [];
        let taxBrackets = [];

        try {
            console.log('[CalculationService] Pre-fetching optimization settings...');
            const [pdsSet, pdsBr, taxBr] = await Promise.all([
                settingsService.getPdsCofinSettings().catch(e => { console.warn('Failed to pre-fetch PDS settings:', e.message); return null; }),
                settingsService.getAllPdsCofinIncomeBrackets().catch(e => { console.warn('Failed to pre-fetch PDS brackets:', e.message); return []; }),
                settingsService.getAllTaxBrackets().catch(e => { console.warn('Failed to pre-fetch Tax brackets:', e.message); return []; })
            ]);
            pdsSettings = pdsSet;
            pdsBrackets = pdsBr || [];
            taxBrackets = taxBr || [];
            console.log(`[CalculationService] Pre-fetched: PDS Settings (${!!pdsSettings}), PDS Brackets (${pdsBrackets.length}), Tax Brackets (${taxBrackets.length})`);
        } catch (e) {
            console.error('[CalculationService] Error pre-fetching settings:', e);
        }

        return {
            poolBalance,
            sharedPoolEvents,
            usedCofinancingPerYear: {},
            usedTaxBasePerYear: {},
            usePool: usePoolFlag,
            isFirstRun: isFirstRun,
            inflationYear: db_inflation_year_percent,
            replenishmentIndexationRate: m_month_percent,
            client: clientData,
            assets: assets,
            settings: settings,
            cachedData: {
                pdsSettings,
                pdsBrackets,
                taxBrackets
            },
            services: {
                settingsService,
                nsjApiService,
                pdsCofinancingService,
                TaxService
            },
            repositories: {
                portfolioRepository,
                productRepository
            }
        };
    }

    /**
     * Smart Capital Allocation (Burden-Based)
     * Distributes poolBalance among goals based on their "monthly savings burden".
     * Goals with higher required monthly savings get more capital to reduce that burden.
     */
    async _calculateSmartAllocation(indexedGoals, context) {
        let pool = context.poolBalance || 0;
        if (pool <= 0) return;

        // 1. Reserve High Priority (FinReserve/Life) needs first
        // These are "Hard Constraints" - we must satisfy them if possible.
        // We use a temporary pool tracking for this phase.
        let tempPool = pool;
        const burdenGoals = [];

        for (const { goal } of indexedGoals) {
            const priority = this._getPriority(goal);

            // Priority 1 & 2 (Reserve & Life) -> Take what they need (Target or Initial)
            if (priority <= 2) {
                let needed = 0;

                // For Life Insurance (id=5), calculate via NSJ API
                if (goal.goal_type_id === 5) {
                    needed = await this._calculateLifeInsuranceNeeded(goal, context);
                } else {
                    // For FinReserve or others
                    needed = goal.initial_capital || 0;
                    if (priority === 1 && needed === 0) needed = goal.target_amount || 0;
                }

                const take = Math.min(tempPool, needed);
                // Real deduction from pool events to reserve the capital
                const actualTaken = this._internalDeduct(take, context);
                goal.smart_initial_capital = actualTaken;
                tempPool -= actualTaken;
                console.log(`[CalculationService] Reserved ${actualTaken} for ${goal.name} (Priority ${priority})`);
            }
            // Phase 2 & 3 handled after this loop
        }

        // Check if there are "Other" goals (Priority > 2 and NOT Investment)
        // We need this to decide if Investment takes 60% or 100% of remainder.
        const hasOtherGoals = indexedGoals.some(i => {
            const p = this._getPriority(i.goal);
            return p > 2 && i.goal.goal_type_id !== 3; // Not Safety, Not Investment
        });

        // 2. Investment Special Rule (ID 3)
        // Allocates 60% of REMAINING free capital (after safety) if other goals exist.
        // If NO other goals, allocates 100% of remainder.
        const investmentGoalObj = indexedGoals.find(i => i.goal.goal_type_id === 3);
        if (investmentGoalObj && tempPool > 0) {
            const ratio = hasOtherGoals ? 0.60 : 1.0;
            const ruleAmount = tempPool * ratio; // 60% of Remainder

            const take = ruleAmount; // It's derived from tempPool, so always available
            const actualTaken = this._internalDeduct(take, context);

            // Add to any existing initial (though unlikely for auto-algo)
            const currentInit = investmentGoalObj.goal.smart_initial_capital || 0;
            investmentGoalObj.goal.smart_initial_capital = currentInit + actualTaken;

            tempPool -= actualTaken;
            console.log(`[CalculationService] Reserved ${actualTaken} for ${investmentGoalObj.goal.name} (Investment Rule)`);
        }

        // 3. Distribute Remaining Pool weighted by Burden (Other Goals)
        // Filter out goals already processed (Safety & Investment)
        for (const { goal } of indexedGoals) {
            const p = this._getPriority(goal);
            if (p <= 2 || goal.goal_type_id === 3) continue;

            // Calculate burden-ready params
            let term = goal.term_months || 120;
            let target = goal.target_amount || 0;

            // SPECIAL HANDLING FOR PENSION/PASSIVE INCOME
            if (goal.goal_type_id === 1) { // PENSION
                const birthYear = context.client.birth_date ? new Date(context.client.birth_date).getFullYear() : 1980;
                const sex = context.client.sex || 'male';
                const isMale = sex === 'male' || sex === 'M' || sex === 'мужской';
                const retAge = isMale ? 65 : 60;
                const yearsToRet = Math.max(retAge - (new Date().getFullYear() - birthYear), 0.5);
                term = Math.round(yearsToRet * 12);

                if (target > 0 && target < 5000000) target = target * 150;
            } else if (goal.goal_type_id === 2) { // PASSIVE_INCOME
                if (goal.desired_monthly_income > 0) {
                    target = goal.desired_monthly_income * 150;
                } else if (target > 0 && target < 10000000) {
                    target = target * 150;
                }
            }

            const burden = target / term;
            burdenGoals.push({ goal, burden, target, term });
        }

        if (tempPool > 0 && burdenGoals.length > 0) {
            const totalBurden = burdenGoals.reduce((sum, item) => sum + item.burden, 0);

            if (totalBurden > 0) {
                for (let i = 0; i < burdenGoals.length; i++) {
                    const item = burdenGoals[i];
                    const isLast = (i === burdenGoals.length - 1);

                    let allocation = 0;
                    if (isLast) {
                        // Последняя цель забирает всё, что осталось (не округляем, чтобы не терять деньги из пула)
                        allocation = tempPool;
                    } else {
                        const weight = item.burden / totalBurden;
                        allocation = tempPool * weight;

                        // CAPPING & DISCOUNTING
                        const years = item.term / 12;
                        if (years > 5) {
                            const discount = 1 / Math.pow(1.07, years);
                            allocation = Math.min(allocation, item.target * discount);
                        } else {
                            allocation = Math.min(allocation, item.target);
                        }

                        // ОКРУГЛЕНИЕ ДО 50 000 (в меньшую сторону)
                        allocation = Math.floor(allocation / 50000) * 50000;
                    }

                    const currentInit = item.goal.smart_initial_capital || 0;
                    const actualTaken = this._internalDeduct(allocation, context);
                    item.goal.smart_initial_capital = currentInit + actualTaken;
                    tempPool -= actualTaken;
                    console.log(`[CalculationService] Reserved ${actualTaken} for ${item.goal.name} (Smart allocation, isLast: ${isLast})`);
                }
            } else {
                // If no burden target, dump to last
                const last = burdenGoals[burdenGoals.length - 1];
                const actualTaken = this._internalDeduct(tempPool, context);
                last.goal.smart_initial_capital = (last.goal.smart_initial_capital || 0) + actualTaken;
            }
        }
    }

    /**
     * Internal deduction for Smart Allocation phase.
     * Modifies context.sharedPoolEvents.
     */
    _internalDeduct(amountNeeded, context) {
        let remaining = amountNeeded;
        let takenTotal = 0;

        if (!context.sharedPoolEvents) return 0;

        for (const event of context.sharedPoolEvents) {
            if (remaining <= 0) break;
            if (event.amount <= 0) continue;

            const take = Math.min(event.amount, remaining);
            event.amount -= take;
            remaining -= take;
            takenTotal += take;
        }

        return takenTotal;
    }

    /**
     * Perform First Run calculation for a client request
     * @param {Object} data - CalculationRequest data
     * @param {string} [targetGoalId] - ID of the goal to recalculate (partial mode)
     * @param {Object} [previousCalculation] - Result of previous calculation for "frozen" goals
     * @param {Object} [options] - Additional options { isFirstRun, usePool }
     */
    async calculateFirstRun(data, targetGoalId = null, previousCalculation = null, options = {}) {
        const { goals, client } = data;
        const isFirstRun = options.isFirstRun !== false; // Default to true for backward compatibility
        const clientData = client ? {
            ...client,
            gender: client.gender || client.sex || 'male',
            birth_date: client.birth_date || '1985-01-01'
        } : {};

        // 1. Prepare Shared Context
        const context = await this._prepareContext(clientData, options);

        // Map previous results by goal ID for quick lookup
        const prevGoalsMap = new Map();
        if (previousCalculation && previousCalculation.calculation && previousCalculation.calculation.goals) {
            previousCalculation.calculation.goals.forEach(g => {
                if (g.goal_id) prevGoalsMap.set(String(g.goal_id), g);
            });
        }

        // 2. Sort goals by Priority
        const indexedGoals = (goals || []).map((g, i) => ({ goal: g, index: i }))
            .sort((a, b) => {
                const pA = a.goal.priority || this._getPriority(a.goal);
                const pB = b.goal.priority || this._getPriority(b.goal);
                if (pA !== pB) return pA - pB;
                return (a.goal.term_months || 0) - (b.goal.term_months || 0);
            });

        // 2.1. Smart Allocation (Burden-Based)
        // Skip if restricted by options OR if we are in partial mode and have previous results
        // User requested: Smart Allocation only for "First Run" (Onboarding)
        if (isFirstRun && (!targetGoalId || !previousCalculation)) {
            console.log('[CalculationService] Running Full Smart Allocation (First Run)...');
            await this._calculateSmartAllocation(indexedGoals, context);
        } else {
            console.log(`[CalculationService] Skipping Smart Allocation (Recalculate Mode or Target Set). isFirstRun: ${isFirstRun}, target: ${targetGoalId}`);
            // In partial mode, we must restore smart_initial_capital from previous results for ALL goals
            // so that deductFromSharedPool works correctly and preserves the "state" of the pool.
            for (const { goal } of indexedGoals) {
                const prev = prevGoalsMap.get(String(goal.id || goal.goal_id));
                if (prev && prev.summary && prev.summary.initial_capital !== undefined) {
                    // CRITICAL: We also need to PRESERVE the initial_capital of the TARGET goal 
                    // unless it was explicitly changed in the 'goal' object itself.
                    // If targetGoalId is set, 'goal' already contains the latest user input.
                    // If goal.initial_capital is already set (from user), we don't overwrite it with 'prev'.

                    const userInitial = goal.initial_capital;
                    if (userInitial !== undefined && userInitial !== null && userInitial > 0) {
                        goal.smart_initial_capital = userInitial;
                    } else {
                        goal.smart_initial_capital = prev.summary.initial_capital;
                    }
                    console.log(`[CalculationService] Set capital ${goal.smart_initial_capital} for goal ${goal.name} (Frozen/Target)`);
                }
            }
        }

        const resultsIndexed = [];

        // 3. Main Loop
        for (const { goal, index } of indexedGoals) {
            const currentGoalId = String(goal.id || goal.goal_id);
            const isTarget = !targetGoalId || currentGoalId === String(targetGoalId);

            if (isTarget) {
                const typeId = goal.goal_type_id;
                const CalculatorClass = CALCULATORS[typeId] || otherGoalCalculator;

                try {
                    const calculator = (typeof CalculatorClass === 'function') ? new CalculatorClass() : CalculatorClass;
                    const result = await calculator.calculate(goal, context);

                    let finalResult = {
                        goal_id: result.goal_id || goal.id,
                        goal_type_id: result.goal_type_id || goal.goal_type_id,
                        goal_type: result.goal_type || 'OTHER',
                        goal_name: goal.name,
                        ...result
                    };

                    resultsIndexed.push({ index, result: finalResult });
                } catch (err) {
                    console.error(`Calculation error for goal ${goal.name}:`, err);
                    resultsIndexed.push({
                        index,
                        result: {
                            goal_id: goal.id || goal.goal_type_id,
                            goal_name: goal.name,
                            error: err.message
                        }
                    });
                }
            } else {
                // FROZEN GOAL: Use previous result but MUST deduct from shared pool to maintain context
                const prevResult = prevGoalsMap.get(currentGoalId);
                if (prevResult) {
                    console.log(`[CalculationService] Using frozen result for goal: ${goal.name}`);

                    // Deduct from pool as if it was calculated
                    // This is crucial so that goals later in priority see the correct remaining balance.
                    const initialCap = prevResult.summary?.initial_capital || 0;
                    if (initialCap > 0) {
                        // We use a dummy calculator or just the base method to deduct
                        const dummyCalculator = otherGoalCalculator;
                        dummyCalculator.deductFromSharedPool(initialCap, context);
                    }

                    // Update PDS limits if they were used by this goal previously
                    if (prevResult.details && prevResult.details.yearly_breakdown) {
                        prevResult.details.yearly_breakdown.forEach(yearData => {
                            const year = yearData.year;
                            if (yearData.cofinancing_for_year > 0) {
                                // We approximate the contribution year as year - 1
                                const contribYear = year - 1;
                                context.usedCofinancingPerYear[contribYear] = (context.usedCofinancingPerYear[contribYear] || 0) + yearData.cofinancing_for_year;
                            }
                            // Note: Tax base is harder to restore exactly without internal simulation state, 
                            // but usually it's tied to contributions. For now, we restore cofinancing which is more critical.
                        });
                    }

                    resultsIndexed.push({ index, result: prevResult });
                } else {
                    // Fallback if no previous result found (should not happen in valid partial mode)
                    console.warn(`[CalculationService] No previous result for frozen goal ${goal.name}, calculating anyway.`);
                    const calculator = (typeof CALCULATORS[goal.goal_type_id] === 'function')
                        ? new CALCULATORS[goal.goal_type_id]()
                        : (CALCULATORS[goal.goal_type_id] || otherGoalCalculator);
                    const result = await calculator.calculate(goal, context);
                    resultsIndexed.push({ index, result });
                }
            }
        }

        // 4. Aggregate Results
        const results = resultsIndexed
            .sort((a, b) => a.index - b.index)
            .map(item => item.result);

        const consolidated = this._generateConsolidatedPortfolio(results);

        // Calculate Age
        const birthDate = new Date(client.birth_date);
        const ageDifMs = Date.now() - birthDate.getTime();
        const ageDate = new Date(ageDifMs);
        const age = Math.abs(ageDate.getUTCFullYear() - 1970);

        return {
            client_id: data.client_id || (client ? client.id : null),
            summary: {
                goals_count: (goals || []).length,
                total_capital: Math.round(results.reduce((sum, r) => {
                    const cap = r.summary?.projected_capital_at_end
                        || r.summary?.total_capital_at_end
                        || r.summary?.projected_capital_at_retirement
                        || r.summary?.expected_cash_value
                        || r.summary?.initial_capital // For RENT/Rentier where capital is preserved
                        || 0;
                    return sum + cap;
                }, 0) * 100) / 100,

                total_state_benefit: Math.round(results.reduce((sum, r) => {
                    // New format: distinct generic fields
                    const tax = r.summary?.total_tax_benefit || 0;
                    const cofin = r.summary?.total_cofinancing || 0;
                    // Legacy format: single field
                    const legacy = r.summary?.state_benefit || 0;
                    // Use max to avoid double counting if both exist (though usually one set exists)
                    return sum + Math.max(tax + cofin, legacy);
                }, 0) * 100) / 100,

                total_target_amount_initial: Math.round(results.reduce((sum, r) => {
                    return sum + (r.summary?.target_amount_initial || r.details?.target_amount_initial || 0);
                }, 0) * 100) / 100,

                total_target_amount_future: Math.round(results.reduce((sum, r) => {
                    return sum + (r.summary?.target_amount_future || r.details?.target_amount_future || 0);
                }, 0) * 100) / 100,

                consolidated_portfolio: consolidated,
                tax_benefits_summary: this._generateTaxBenefitsSummary(results)
            },
            goals: results
        };
    }

    /**
     * Generate Tax Benefits Summary (PDS + NSJ)
     * Aggregates tax deductions and cofinancing from all goals for frontend display
     */
    _generateTaxBenefitsSummary(results) {
        let pdsTotalDeductions = 0;
        let pdsTotalCofinancing = 0;

        let nsjAnnualPremium = 0;
        let nsjDeduction2026 = 0;
        let nsjTotalDeductions = 0;

        let pdsDeduction2026 = 0;
        let pdsCofinancing2026 = 0;

        // Collect from all goals
        results.forEach(result => {
            if (result.details) {
                // PDS tax refunds (from Pension, Passive Income, Investment goals)
                const taxRef = result.details.total_tax_deductions_nominal || result.details.total_tax_refund || result.summary?.total_tax_benefit || 0;
                // Avoid double counting if using summary (which includes NSJ for LIFE, but here we want PDS? No, summary is total per goal)
                // Actually, strict logic:
                // If goal is LIFE, tax benefit is NSJ.
                // If goal is NOT LIFE, tax benefit is likely PDS/IIS.

                if (result.goal_id === 5 || result.goal_type === 'LIFE') {
                    // NSJ Logic handled below
                } else {
                    pdsTotalDeductions += taxRef;
                }

                // PDS cofinancing
                const cofin = result.details.total_cofinancing_nominal || result.details.total_cofinancing || result.summary?.total_cofinancing || 0;
                pdsTotalCofinancing += cofin;

                // NSJ from Life goal
                if (result.goal_id === 5 || result.goal_type === 'LIFE') {
                    nsjAnnualPremium = result.details.annual_premium || 0;
                    nsjDeduction2026 = result.details.tax_deduction_2026 || 0;
                    // Check summary if details missing
                    nsjTotalDeductions = result.details.total_tax_deductions || result.summary?.total_tax_benefit || 0;
                }

                // 'yearly_breakdown' might be missing in new Unified Calc. 
                // If so, 2026 prediction will be 0. This is a known limitation of the simplified output.
                if (result.details.yearly_breakdown && Array.isArray(result.details.yearly_breakdown)) {
                    // PDS benefits for Year X are received in Year X+1.
                    // To show "Benefits for 2026", we look at cash flows in 2027.
                    const year2027 = result.details.yearly_breakdown.find(y => y.year === 2027);
                    if (year2027) {
                        pdsDeduction2026 += (year2027.tax_refund_projected || 0);
                        pdsCofinancing2026 += (year2027.cofinancing_for_year || 0);
                    }
                }
            }
        });

        const totalDeduction2026 = Math.round((pdsDeduction2026 + nsjDeduction2026) * 100) / 100;
        const totalCofinancing2026 = Math.round(pdsCofinancing2026 * 100) / 100;

        const totalDeductionsAll = Math.round((pdsTotalDeductions + nsjTotalDeductions) * 100) / 100;
        const totalCofinancingAll = Math.round(pdsTotalCofinancing * 100) / 100;

        return {
            pds_benefits: {
                deduction_2026: Math.round(pdsDeduction2026 * 100) / 100,
                cofinancing_2026: Math.round(pdsCofinancing2026 * 100) / 100,
                total_deductions: Math.round(pdsTotalDeductions * 100) / 100,
                total_cofinancing: Math.round(pdsTotalCofinancing * 100) / 100
            },
            nsj_benefits: {
                annual_premium: Math.round(nsjAnnualPremium * 100) / 100,
                deduction_2026: Math.round(nsjDeduction2026 * 100) / 100,
                total_deductions: Math.round(nsjTotalDeductions * 100) / 100
            },
            totals: {
                deduction_2026: totalDeduction2026,
                cofinancing_2026: totalCofinancing2026,

                total_deductions: totalDeductionsAll,
                total_cofinancing: totalCofinancingAll,

                total_state_benefits: Math.round((totalDeductionsAll + totalCofinancingAll) * 100) / 100
            }
        };
    }

    _generateConsolidatedPortfolio(results) {
        const assetsMap = {};
        const flowsMap = {};
        let totalInitial = 0;
        let totalMonthly = 0;

        results.forEach(res => {
            if (!res.details) return;

            // Special handling for LIFE goals (NSJ/ISJ) which don't have standard instruments
            if (res.goal_type === 'LIFE' || res.goal_id === 5) {
                const programName = res.details.program_name || res.goal_name || 'Страхование жизни';

                // Asset (Initial Capital)
                const initialCap = res.summary?.initial_capital || 0;
                if (initialCap > 0) {
                    if (!assetsMap[programName]) assetsMap[programName] = { amount: 0, weightedYieldSum: 0 };
                    assetsMap[programName].amount += initialCap;
                    const yieldP = res.summary?.investment_yield_percent || 0;
                    assetsMap[programName].weightedYieldSum += (initialCap * yieldP);
                    totalInitial += initialCap;
                }

                // Cash Flow (Monthly allocation)
                const annualPrem = res.details?.annual_premium || 0;
                if (annualPrem > 0) {
                    // User requested: divide by period. Since this is "Consolidated Portfolio" (usually monthly view),
                    // we convert annual premium to monthly burden: / 12.
                    const monthlyAmount = annualPrem / 12;
                    const freq = res.summary?.premium_frequency || 'monthly';

                    if (!flowsMap[programName]) flowsMap[programName] = { amount: 0, weightedYieldSum: 0, payment_frequency: freq };
                    flowsMap[programName].amount += monthlyAmount;
                    const yieldP = res.summary?.investment_yield_percent || 0;
                    flowsMap[programName].weightedYieldSum += (monthlyAmount * yieldP);
                    totalMonthly += monthlyAmount;
                }

                return; // Skip standard instrument logic for this goal
            }

            // Strategy to find instruments:
            // 1. details.instruments (Unified standard for Investment, Other, Rent, FinReserve)
            // 2. details.portfolio_structure.initial_instruments (Pension)
            // 3. details.initial_capital_instruments (Legacy / Life)
            // 4. details.portfolio.instruments (Legacy)

            let initialInstrs = [];
            let monthlyInstrs = [];

            // Try to find Initial Capital Instruments
            if (res.details.portfolio_structure && Array.isArray(res.details.portfolio_structure.initial_instruments)) {
                initialInstrs = res.details.portfolio_structure.initial_instruments;
            } else if (res.details.initial_capital_instruments) {
                initialInstrs = res.details.initial_capital_instruments;
            } else if (res.details.initial_instruments) {
                initialInstrs = res.details.initial_instruments;
            } else if (Array.isArray(res.details.instruments)) {
                // Use summary.initial_capital to determine amount if needed, or use instrument amount
                // If instruments are generic, we assume they apply to initial capital proportional to share?
                // Or we look for specific bucket?
                // Better: use instruments as is, but check if they have 'amount'
                const goalInitial = res.summary?.initial_capital || 0;
                initialInstrs = res.details.instruments.map(i => ({
                    ...i,
                    amount: (i.amount !== undefined) ? i.amount : (goalInitial * (i.share / 100))
                }));
            } else if (res.details.portfolio && Array.isArray(res.details.portfolio.instruments)) {
                const goalInitial = res.summary?.initial_capital || 0;
                initialInstrs = res.details.portfolio.instruments.map(i => ({
                    ...i,
                    amount: (i.amount !== undefined) ? i.amount : (goalInitial * (i.share / 100))
                }));
            }

            // Try to find Monthly Instruments
            if (res.details.portfolio_structure && Array.isArray(res.details.portfolio_structure.monthly_instruments)) {
                monthlyInstrs = res.details.portfolio_structure.monthly_instruments;
            } else if (res.details.monthly_savings_instruments) {
                monthlyInstrs = res.details.monthly_savings_instruments;
            } else if (res.details.monthly_instruments) {
                monthlyInstrs = res.details.monthly_instruments;
            } else if (Array.isArray(res.details.instruments) && (res.summary?.monthly_replenishment > 0)) {
                const goalMonthly = res.summary.monthly_replenishment;
                monthlyInstrs = res.details.instruments.map(i => ({
                    ...i,
                    amount: (goalMonthly * (i.share / 100)) // Re-calculate for monthly flow
                }));
            }

            // Aggregate Assets
            initialInstrs.forEach(inst => {
                const name = inst.name || 'Unknown';
                const amt = inst.amount || 0;
                const yieldP = inst.yield || 0;

                if (!assetsMap[name]) assetsMap[name] = { amount: 0, weightedYieldSum: 0 };
                assetsMap[name].amount += amt;
                assetsMap[name].weightedYieldSum += (amt * yieldP);
                totalInitial += amt;
            });

            // Aggregate Flows
            monthlyInstrs.forEach(inst => {
                const name = inst.name || 'Unknown';
                const amt = inst.amount || 0; // Monthly amount
                const yieldP = inst.yield || 0;
                const freq = inst.payment_frequency || 'monthly'; // Track frequency

                if (!flowsMap[name]) flowsMap[name] = { amount: 0, weightedYieldSum: 0, payment_frequency: freq };
                flowsMap[name].amount += amt;
                flowsMap[name].weightedYieldSum += (amt * yieldP);
                // Keep the payment_frequency from instrument (prefer non-monthly if specified)
                if (freq !== 'monthly' && flowsMap[name].payment_frequency === 'monthly') {
                    flowsMap[name].payment_frequency = freq;
                }
                totalMonthly += amt;
            });
        });

        const assetsAllocation = Object.keys(assetsMap).map(name => {
            const data = assetsMap[name];
            return {
                name,
                amount: Math.round(data.amount * 100) / 100,
                share: totalInitial > 0 ? Math.round((data.amount / totalInitial) * 100) : 0,
                yield: data.amount > 0 ? Math.round((data.weightedYieldSum / data.amount) * 100) / 100 : 0
            };
        }).filter(a => a.amount > 0).sort((a, b) => b.amount - a.amount);

        const cashFlowAllocation = Object.keys(flowsMap).map(name => {
            const data = flowsMap[name];
            return {
                name,
                amount: Math.round(data.amount * 100) / 100,
                share: totalMonthly > 0 ? Math.round((data.amount / totalMonthly) * 100) : 0,
                yield: data.amount > 0 ? Math.round((data.weightedYieldSum / data.amount) * 100) / 100 : 0,
                payment_frequency: data.payment_frequency || 'monthly' // Default to monthly if not specified
            };
        }).filter(a => a.amount > 0).sort((a, b) => b.amount - a.amount);

        return {
            total_initial_capital: Math.round(totalInitial * 100) / 100,
            total_monthly_replenishment: Math.round(totalMonthly * 100) / 100,
            assets_allocation: assetsAllocation,
            cash_flow_allocation: cashFlowAllocation
        };
    }
}

module.exports = new CalculationService();
