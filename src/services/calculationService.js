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
    8: rentCalculator          // RENT
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


    async _prepareContext(clientData) {
        // Collect assets and pool
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
    _calculateSmartAllocation(indexedGoals, context) {
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
                // Determine need: For reserve it's target, for Life it's initial premium
                // Since calculators logic is complex, we assume:
                // If initial_capital is set, use it. If not, try target_amount for Reserve.
                let needed = goal.initial_capital || 0;
                if (priority === 1 && needed === 0) needed = goal.target_amount || 0;

                // Allow "Life" to be treated as burden-based if no initial set? 
                // Currently strictly priority.
                const take = Math.min(tempPool, needed);
                goal.smart_initial_capital = take;
                tempPool -= take;
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

            // Add to any existing initial (though unlikely for auto-algo)
            const currentInit = investmentGoalObj.goal.smart_initial_capital || 0;
            investmentGoalObj.goal.smart_initial_capital = currentInit + take;

            tempPool -= take;
        }

        // 3. Distribute Remaining Pool weighted by Burden (Other Goals)
        // Filter out goals already processed (Safety & Investment)

        for (const { goal } of indexedGoals) {
            const p = this._getPriority(goal);
            if (p <= 2 || goal.goal_type_id === 3) continue;

            // Calculate Burden
            const term = goal.term_months || 120;
            let target = goal.target_amount || 0;

            if (goal.goal_type_id === 2 && target > 0 && target < 10000000) target = target * 150;
            if (goal.goal_type_id === 1 && target > 0 && target < 5000000) target = target * 150;

            const burden = target / term;
            burdenGoals.push({ goal, burden, target });
        }

        if (tempPool > 0 && burdenGoals.length > 0) {
            const totalBurden = burdenGoals.reduce((sum, item) => sum + item.burden, 0);

            if (totalBurden > 0) {
                for (const item of burdenGoals) {
                    const weight = item.burden / totalBurden;
                    const allocation = Math.min(item.target, tempPool * weight);
                    const currentInit = item.goal.smart_initial_capital || 0; // Use smart_initial_capital if already set
                    item.goal.smart_initial_capital = currentInit + allocation;
                }
            } else {
                // If no burden target, dump to last
                const last = burdenGoals[burdenGoals.length - 1];
                last.goal.smart_initial_capital = (last.goal.smart_initial_capital || 0) + tempPool; // Use smart_initial_capital if already set
            }
        }

        // Note: we do NOT update context.poolBalance here. 
        // Real deduction happens in calculators via deductFromSharedPool.
        // We just set a "suggestion" (smart_initial_capital) which deductFromSharedPool will respect.
    }

    /**
     * Perform First Run calculation for a client request
     * @param {Object} data - CalculationRequest data
     */
    async calculateFirstRun(data) {
        const { goals, client } = data;
        const clientData = client || {};

        // 1. Prepare Shared Context
        const context = await this._prepareContext(clientData);

        // 2. Sort goals by Priority
        const indexedGoals = (goals || []).map((g, i) => ({ goal: g, index: i }))
            .sort((a, b) => {
                const pA = a.goal.priority || this._getPriority(a.goal);
                const pB = b.goal.priority || this._getPriority(b.goal);
                if (pA !== pB) return pA - pB;
                return (a.goal.term_months || 0) - (b.goal.term_months || 0);
            });

        // 2.1. Smart Allocation (Burden-Based)
        console.log('[CalculationService] Running Smart Allocation...');
        this._calculateSmartAllocation(indexedGoals, context);

        const resultsIndexed = [];

        // 3. Main Loop
        for (const { goal, index } of indexedGoals) {
            const typeId = goal.goal_type_id;
            const CalculatorClass = CALCULATORS[typeId] || otherGoalCalculator;

            try {
                // Initialize calculator if it's a class, or use as object
                const calculator = (typeof CalculatorClass === 'function') ? new CalculatorClass() : CalculatorClass;

                const result = await calculator.calculate(goal, context);
                resultsIndexed.push({ index, result });
            } catch (err) {
                console.error(`Calculation error for goal ${goal.name}:`, err);
                resultsIndexed.push({
                    index,
                    result: {
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        error: err.message
                    }
                });
            }
        }

        // 4. Aggregate Results
        const results = resultsIndexed
            .sort((a, b) => a.index - b.index)
            .map(item => item.result);

        const consolidated = this._generateConsolidatedPortfolio(results);

        return {
            summary: {
                goals_count: goals.length,
                total_capital: Math.round(results.reduce((sum, r) => sum + (r.summary?.total_capital_at_end || 0), 0) * 100) / 100,
                total_state_benefit: Math.round(results.reduce((sum, r) => sum + (r.summary?.state_benefit || 0), 0) * 100) / 100,
                total_target_amount_initial: Math.round(results.reduce((sum, r) => sum + (r.details?.target_amount_initial || 0), 0) * 100) / 100,
                total_target_amount_future: Math.round(results.reduce((sum, r) => sum + (r.details?.target_amount_future || 0), 0) * 100) / 100,
                consolidated_portfolio: consolidated
            },
            goals: results
        };
    }

    _generateConsolidatedPortfolio(results) {
        const assetsMap = {};
        const flowsMap = {};
        let totalInitial = 0;
        let totalMonthly = 0;

        results.forEach(res => {
            if (!res.details) return;

            // Normalize portfolio instruments to an array
            let instruments = [];

            // Some calculators return portfolio object, others return flat instruments
            if (res.details.portfolio) {
                const p = res.details.portfolio;
                if (Array.isArray(p.instruments)) {
                    instruments = p.instruments;
                } else if (p.instruments && Array.isArray(p.instruments)) {
                    instruments = p.instruments;
                }
            }

            // Special handling for calculators that return logic differently (e.g. Pension)
            // Pension returns `initial_instruments` and `monthly_instruments` in details root
            // But let's try to stick to what we standardized if possible. 
            // PensionCalculator returns `initial_instruments` in details.

            let initialInstrs = [];
            let monthlyInstrs = [];

            if (res.details.initial_capital_instruments) {
                initialInstrs = res.details.initial_capital_instruments;
            } else if (res.details.initial_instruments) { // Fallback/Legacy
                initialInstrs = res.details.initial_instruments;
            } else if (instruments.length > 0) {
                // Assume proportional split if specific buckets not defined?
                // Or just use the instruments for initial if they have 'amount' or 'share'
                // This is tricky. Let's simplify:
                // Use `summary.initial_capital` as total for this goal.
                // Distribute by share in instruments.
                const goalInitial = res.summary.initial_capital || 0;
                initialInstrs = instruments.map(i => ({ ...i, amount: (i.amount || (goalInitial * (i.share / 100))) }));
            }

            if (res.details.monthly_savings_instruments) {
                monthlyInstrs = res.details.monthly_savings_instruments;
            } else if (res.details.monthly_instruments) { // Fallback/Legacy
                monthlyInstrs = res.details.monthly_instruments;
            } else if (instruments.length > 0) {
                const goalMonthly = res.summary.monthly_replenishment || 0;
                monthlyInstrs = instruments.map(i => ({ ...i, amount: (i.amount || (goalMonthly * (i.share / 100))) }));
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

                if (!flowsMap[name]) flowsMap[name] = { amount: 0, weightedYieldSum: 0 };
                flowsMap[name].amount += amt;
                flowsMap[name].weightedYieldSum += (amt * yieldP);
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
                yield: data.amount > 0 ? Math.round((data.weightedYieldSum / data.amount) * 100) / 100 : 0
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
