const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');
const logger = require('../utils/logger'); // <-- Added logger
const pdsCofinancingService = require('./pdsCofinancingService');
const TaxService = require('../algorithms/TaxService');
const pensionCalculator = require('../algorithms/calculators/PensionCalculator');
const investmentCalculator = require('../algorithms/calculators/InvestmentCalculator');
const passiveIncomeCalculator = require('../algorithms/calculators/PassiveIncomeCalculator');
const lifeInsuranceCalculator = require('../algorithms/calculators/LifeInsuranceCalculator');
const finReserveCalculator = require('../algorithms/calculators/FinReserveCalculator');
const otherGoalCalculator = require('../algorithms/calculators/OtherGoalCalculator');
const rentCalculator = require('../algorithms/calculators/RentCalculator');
const riskProfileService = require('./riskProfileService');
const portfolioAggregator = require('../algorithms/PortfolioAggregator');
const { getLifeFirstPaymentAmount } = require('../algorithms/calculators/lifeUpfrontAmount');

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

/** Доля пула под первоначальный капитал пенсии: от возраста, макс. 20% */
const PENSION_SHARE_MIN = 0.05;
const PENSION_SHARE_MAX = 0.20;
const PENSION_SHARE_AGE_LOW = 30;
const PENSION_SHARE_AGE_HIGH = 55;

class CalculationService {
    /**
     * Рассчитать прогнозную государственную пенсию
     * @param {Object} client - Данные клиента (ClientData)
     * @param {Object} systemSettings - Системные настройки пенсии
     * @param {Date} nowDate - Текущая дата
     * @returns {Object} Результат расчета госпенсии
     */
    async calculateStatePension(client, systemSettings, nowDate) {
        console.log(`[CalculationService] calculateStatePension for client: ${client.fio || 'anonymous'}`);
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

    _getClientAgeYears(client) {
        if (!client || !client.birth_date) return 40;
        const b = new Date(client.birth_date);
        const t = new Date();
        let age = t.getFullYear() - b.getFullYear();
        const m = t.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
        return Math.max(0, age);
    }

    /** Линейная интерполяция 5% (до 30 лет) … 20% (с 55 лет), не выше 20% */
    _pensionInitialShareFromAge(ageYears) {
        const a = Number(ageYears);
        if (!Number.isFinite(a)) return PENSION_SHARE_MIN;
        if (a <= PENSION_SHARE_AGE_LOW) return PENSION_SHARE_MIN;
        if (a >= PENSION_SHARE_AGE_HIGH) return PENSION_SHARE_MAX;
        return PENSION_SHARE_MIN + (PENSION_SHARE_MAX - PENSION_SHARE_MIN) * (a - PENSION_SHARE_AGE_LOW) / (PENSION_SHARE_AGE_HIGH - PENSION_SHARE_AGE_LOW);
    }

    /**
     * Вес цели «стоимость / срок» для пропорций (пенсия / пассивка / прочее).
     */
    _smartGoalWeight(goal, context) {
        let term = goal.term_months || 120;
        let target = goal.target_amount || 0;

        if (goal.goal_type_id === 1) {
            const birthYear = context.client.birth_date ? new Date(context.client.birth_date).getFullYear() : 1980;
            const sex = context.client.sex || 'male';
            const isMale = sex === 'male' || sex === 'M' || sex === 'мужской';
            const retAge = isMale ? 65 : 60;
            const yearsToRet = Math.max(retAge - (new Date().getFullYear() - birthYear), 0.5);
            term = Math.round(yearsToRet * 12);

            if (goal.desired_monthly_income > 0) {
                target = goal.desired_monthly_income;
            }
        } else if (goal.goal_type_id === 2) {
            if (goal.desired_monthly_income > 0) {
                target = goal.desired_monthly_income * 150;
            } else if (target > 0 && target < 10000000) {
                target = target * 150;
            }
        }

        const t = Math.max(term, 1);
        return Math.max(target / t, 1e-9);
    }

    _weightInvestmentOrRent(goal) {
        const term = goal.term_months || (goal.goal_type_id === 8 ? 12 : 120);
        const target = Number(goal.target_amount || goal.initial_capital || 0);
        const t = Math.max(term, 1);
        return Math.max(target / t, 1e-9);
    }

    /**
     * Списывает с пула до sliceCap суммарно, делит между goals по weightFn.
     * @returns {number} фактически списано
     */
    _allocatePoolSliceAmongGoals(goals, sliceCap, context, weightFn) {
        if (!goals || goals.length === 0 || sliceCap <= 0) return 0;
        const weights = goals.map(g => Math.max(weightFn(g, context), 1e-9));
        const sumW = weights.reduce((a, b) => a + b, 0);
        let budgetLeft = sliceCap;
        let totalTaken = 0;

        for (let i = 0; i < goals.length; i++) {
            const isLast = i === goals.length - 1;
            const ideal = isLast ? budgetLeft : (sliceCap * weights[i]) / sumW;
            const take = Math.min(ideal, budgetLeft);
            const actual = this._internalDeduct(take, context);
            const g = goals[i];
            g.smart_initial_capital = (g.smart_initial_capital || 0) + actual;
            totalTaken += actual;
            budgetLeft -= actual;
            if (budgetLeft <= 0) break;
        }
        return totalTaken;
    }

    /**
     * Актив «наличные/депозит» на мес.0 — уже отражён в total_liquid_capital или в derived pool;
     * не добавляем второй раз в sharedPoolEvents (иначе пул фактически удваивается).
     */
    _isMonthZeroLiquidAssetMergedIntoPool(a) {
        const month = a.unlock_month || a.sell_month || 0;
        if (month !== 0) return false;
        const type = (a.type || '').toUpperCase();
        return type === 'CASH'
            || type === 'НАЛИЧНЫЕ'
            || type === 'DEPOSIT'
            || type === 'DEPOSIT_ACCOUNT';
    }

    async _prepareContext(clientData, options = {}) {
        // Collect assets and pool
        const isFirstRun = options.isFirstRun !== false;
        const usePoolFlag = options.usePool !== false;
        const projectId = clientData.project_id || null;

        let poolBalance = Number(clientData.total_liquid_capital || 0);
        const assets = clientData.assets || [];

        // If total_liquid_capital is not provided (or zero), derive liquid pool from CASH-like assets at month 0
        if ((!clientData.total_liquid_capital || Number(clientData.total_liquid_capital) === 0) &&
            poolBalance === 0 &&
            Array.isArray(assets) &&
            assets.length > 0) {
            const derivedLiquid = assets.reduce((sum, a) => {
                if (this._isMonthZeroLiquidAssetMergedIntoPool(a)) {
                    return sum + Number(a.amount || a.current_value || 0);
                }
                return sum;
            }, 0);

            if (derivedLiquid > 0) {
                poolBalance = derivedLiquid;
                logger.info(`[CalculationService] Derived poolBalance=${poolBalance} from CASH/DEPOSIT assets at month 0 (no total_liquid_capital provided).`);
            }
        }

        // Chronological list of shared pool events (unlock_month: 0 is current liquid)
        const sharedPoolEvents = assets
            .filter(a => !a.goal_id)
            // Prevent double-counting: if it's CASH/DEPOSIT at month 0, we assume it's part of total_liquid_capital
            .filter(a => !this._isMonthZeroLiquidAssetMergedIntoPool(a))
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
            'investment_expense_growth_annual',
            'inflation_rate_year',
            'inflation_rate_matrix',
            'smart_allocation_inv_rent_share',
            'pension_pfr_contribution_rate_part1',
            'pension_fixed_payment',
            'pension_point_cost',
            'pension_max_salary_limit',
            'pension_ipk_past_coef'
        ];

        for (const key of allSettingsKeys) {
            try {
                const s = await settingsService.getSettingByKey(key, projectId);
                settings[key] = s ? s.value : null;
                if (!s) logger.warn(`[CalculationService] Setting ${key} NOT FOUND for project ${projectId}`);
            } catch (e) {
                logger.warn(`[CalculationService] Could not fetch setting ${key}:`, e.message);
            }
        }

        // Рост расходов на инвестиции: в админке задаётся годовая % (investment_expense_growth_annual); считаем месячную долю. Иначе fallback на месячную % (investment_expense_growth_monthly).
        const annualGrowth = settings.investment_expense_growth_annual;
        const replenishmentIndexationRateDecimal = (annualGrowth != null && annualGrowth !== undefined && annualGrowth !== '')
            ? Math.pow(1 + (Number(annualGrowth) / 100), 1 / 12) - 1
            : ((settings.investment_expense_growth_monthly || 0) / 100);
        // Годовая % для вывода в ответе (если задана месячная — пересчитываем в годовую)
        const investmentExpenseGrowthAnnualPercent = (annualGrowth != null && annualGrowth !== undefined && annualGrowth !== '')
            ? Number(annualGrowth)
            : (settings.investment_expense_growth_monthly != null && settings.investment_expense_growth_monthly !== '')
                ? (Math.pow(1 + Number(settings.investment_expense_growth_monthly) / 100, 12) - 1) * 100
                : null;
        const db_inflation_year_percent = settings.inflation_rate_year || 4.0;

        // Матрица инфляции по месяцам (ranges: [{ fromMonth, toMonthExcl, rateAnnual }]); если пусто — используем одну ставку
        let inflationMatrix = null;
        const rawMatrix = settings.inflation_rate_matrix ?? await settingsService.getValue('inflation_rate_matrix', projectId).catch(() => null);
        if (rawMatrix != null) {
            const raw = rawMatrix;
            if (typeof raw === 'object' && Array.isArray(raw.ranges) && raw.ranges.length > 0) {
                inflationMatrix = raw;
            } else if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && Array.isArray(parsed.ranges) && parsed.ranges.length > 0) {
                        inflationMatrix = parsed;
                    }
                } catch (_) { /* ignore */ }
            }
        }
        if (inflationMatrix) logger.info(`[CalculationService] Inflation matrix loaded for project ${projectId}, ranges: ${inflationMatrix.ranges.length}`);

        // Pre-fetch Optimization Data (Cached Settings)
        let pdsSettings = null;
        let pdsBrackets = [];
        let taxBrackets = [];

        try {
            logger.info('[CalculationService] Pre-fetching optimization settings...');
            const [pdsSet, pdsBr, taxBr] = await Promise.all([
                settingsService.getPdsCofinSettings(projectId).catch(e => { logger.warn('Failed to pre-fetch PDS settings:', e.message); return null; }),
                settingsService.getAllPdsCofinIncomeBrackets(projectId).catch(e => { logger.warn('Failed to pre-fetch PDS brackets:', e.message); return []; }),
                settingsService.getAllTaxBrackets(projectId).catch(e => { logger.warn('Failed to pre-fetch Tax brackets:', e.message); return []; })
            ]);
            pdsSettings = pdsSet;
            pdsBrackets = pdsBr || [];
            taxBrackets = taxBr || [];
            logger.info(`[CalculationService] Pre-fetched: PDS Settings (${!!pdsSettings}), PDS Brackets (${pdsBrackets.length}), Tax Brackets (${taxBrackets.length})`);
        } catch (e) {
            logger.error('[CalculationService] Error pre-fetching settings:', e);
        }

        return {
            projectId,
            poolBalance,
            sharedPoolEvents,
            usedCofinancingPerYear: {},
            usedTaxBasePerYear: {},
            usePool: usePoolFlag,
            isFirstRun: isFirstRun,
            inflationYear: db_inflation_year_percent,
            inflationMatrix,
            replenishmentIndexationRate: replenishmentIndexationRateDecimal,
            investmentExpenseGrowthAnnualPercent,
            client: clientData,
            assets: assets,
            settings: settings,
            smartAllocationInvRentShare: Number.isFinite(Number(settings.smart_allocation_inv_rent_share))
                ? Number(settings.smart_allocation_inv_rent_share)
                : 0.60,
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
     * Smart Capital Allocation
     * Фаза 1: резерв + LIFE (первый взнос по NSJ/fallback).
     * Фаза 2: 60% остатка (или 100%) — инвестиции (3) и RENT (8), 50/50 между классами при обоих; внутри класса — по весу стоимость/срок.
     * Фаза 3a: пенсия — доля остатка от возраста, макс. 20%.
     * Фаза 3b: остальные цели — пропорционально стоимость/срок, последняя в группе забирает бюджетный хвост.
     */
    async _calculateSmartAllocation(indexedGoals, context) {
        let pool = context.poolBalance || 0;
        if (pool <= 0) return;

        let tempPool = pool;

        // 1. Reserve FinReserve + LIFE
        for (const { goal } of indexedGoals) {
            const priority = this._getPriority(goal);
            if (priority > 2) continue;

            let needed = 0;
            if (goal.goal_type_id === 5) {
                needed = await getLifeFirstPaymentAmount(goal, context);
            } else {
                needed = goal.initial_capital || 0;
                if (priority === 1 && needed === 0) needed = goal.target_amount || 0;
            }

            const take = Math.min(tempPool, needed);
            const actualTaken = this._internalDeduct(take, context);
            goal.smart_initial_capital = actualTaken;
            tempPool -= actualTaken;
            logger.info(`[CalculationService] Reserved ${actualTaken} for ${goal.name} (Priority ${priority})`);
        }

        const hasOtherGoals = indexedGoals.some(i => {
            const p = this._getPriority(i.goal);
            return p > 2 && i.goal.goal_type_id !== 3 && i.goal.goal_type_id !== 8;
        });

        const invGoals = indexedGoals.filter(i => i.goal.goal_type_id === 3).map(i => i.goal);
        const rentGoals = indexedGoals.filter(i => i.goal.goal_type_id === 8).map(i => i.goal);
        const hasInv = invGoals.length > 0;
        const hasRent = rentGoals.length > 0;

        // 2. Investment + RENT
        if ((hasInv || hasRent) && tempPool > 0) {
            const configuredShare = Number.isFinite(Number(context.smartAllocationInvRentShare))
                ? Number(context.smartAllocationInvRentShare)
                : 0.60;
            const safeShare = Math.max(0, Math.min(configuredShare, 1));
            const ratio = hasOtherGoals ? safeShare : 1.0;
            const ruleAmount = tempPool * ratio;

            let invPart = 0;
            let rentPart = 0;
            if (hasInv && hasRent) {
                invPart = ruleAmount * 0.5;
                rentPart = ruleAmount * 0.5;
            } else if (hasInv) {
                invPart = ruleAmount;
            } else {
                rentPart = ruleAmount;
            }

            const tInv = this._allocatePoolSliceAmongGoals(invGoals, invPart, context, (g) => this._weightInvestmentOrRent(g));
            const tRent = this._allocatePoolSliceAmongGoals(rentGoals, rentPart, context, (g) => this._weightInvestmentOrRent(g));
            tempPool -= (tInv + tRent);
            logger.info(`[CalculationService] Phase2 INV/RENT: inv=${tInv}, rent=${tRent}, ruleAmount=${ruleAmount}`);
        }

        // 3a. Пенсия — доля от остатка по возрасту (макс. 20%)
        const pensionGoals = indexedGoals
            .map(({ goal }) => goal)
            .filter(g => this._getPriority(g) > 2 && g.goal_type_id === 1);

        if (pensionGoals.length > 0 && tempPool > 0) {
            const age = this._getClientAgeYears(context.client);
            const share = this._pensionInitialShareFromAge(age);
            const pensionCap = tempPool * Math.min(share, PENSION_SHARE_MAX);
            const tPen = this._allocatePoolSliceAmongGoals(
                pensionGoals,
                pensionCap,
                context,
                (g, ctx) => this._smartGoalWeight(g, ctx)
            );
            tempPool -= tPen;
            logger.info(`[CalculationService] Phase3a Pension age=${age} share=${share} taken=${tPen}`);
        }

        // 3b. Пассивка, прочее и т.д. (без 1,3,8 и без p<=2)
        const restGoals = indexedGoals
            .map(({ goal }) => goal)
            .filter(g => {
                const p = this._getPriority(g);
                return p > 2 && g.goal_type_id !== 3 && g.goal_type_id !== 8 && g.goal_type_id !== 1;
            });

        if (restGoals.length > 0 && tempPool > 0) {
            const wFn = (g, ctx) => this._smartGoalWeight(g, ctx);
            const sumW = restGoals.reduce((s, g) => s + wFn(g, context), 0);
            if (sumW <= 0 || !Number.isFinite(sumW)) {
                const n = restGoals.length;
                let rem = tempPool;
                for (let i = 0; i < n; i++) {
                    const isLast = i === n - 1;
                    const take = isLast ? rem : rem / (n - i);
                    const actual = this._internalDeduct(take, context);
                    const g = restGoals[i];
                    g.smart_initial_capital = (g.smart_initial_capital || 0) + actual;
                    rem -= actual;
                    tempPool -= actual;
                }
                logger.info('[CalculationService] Phase3b equal split (zero weights)');
            } else {
                const tRest = this._allocatePoolSliceAmongGoals(restGoals, tempPool, context, wFn);
                tempPool -= tRest;
                logger.info(`[CalculationService] Phase3b proportional taken=${tRest}`);
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
        logger.info("[CalculationService] calculateFirstRun STARTED");
        logger.debug("[CalculationService] Request data:", {
            targetGoalId,
            isFirstRun: options.isFirstRun,
            usePool: options.usePool
        });
        try {
            const { goals, client, assets: requestRootAssets } = data;
            const isFirstRun = options.isFirstRun !== false; // Default to true for backward compatibility

            const clientData = client ? {
                ...client,
                gender: client.gender || client.sex || 'male',
                birth_date: client.birth_date || '1985-01-01'
            } : {};

            // ЛК/фронт часто шлёт assets в корне тела, а не в client.assets — иначе пул=0 и смарт-аллокация не бежит
            const assetsFromClient = Array.isArray(clientData.assets) ? clientData.assets : [];
            const assetsFromRoot = Array.isArray(requestRootAssets) ? requestRootAssets : [];
            clientData.assets = assetsFromClient.length > 0 ? assetsFromClient : assetsFromRoot;

            logger.info(`[CalculationService] calculateFirstRun for project: ${clientData.project_id}, Goals: ${goals?.length}`);

            // 1. Prepare Shared Context
            const context = await this._prepareContext(clientData, options);
            logger.info(`[CalculationService] Context prepared. Project: ${context.projectId}`);

            // Map previous results by goal ID for quick lookup
            const prevGoalsMap = new Map();
            const prevGoalsSource = (previousCalculation && previousCalculation.calculation && previousCalculation.calculation.goals)
                ? previousCalculation.calculation.goals
                : (previousCalculation && previousCalculation.goals ? previousCalculation.goals : null);

            if (prevGoalsSource) {
                prevGoalsSource.forEach(g => {
                    if (g.goal_id) prevGoalsMap.set(String(g.goal_id), g);
                });
            }

            // 2. Sort goals by Priority
            const indexedGoals = (goals || []).map((g, i) => {
                // [FIX] For Pension goals, if desired_monthly_income is missing, default to 70% of current income
                if (g.goal_type_id === 1 && (!g.desired_monthly_income || g.desired_monthly_income <= 0)) {
                    const currentIncome = clientData.avg_monthly_income || 0;
                    if (currentIncome > 0) {
                        g.desired_monthly_income = currentIncome * 0.7;
                        logger.info(`[CalculationService] Auto-set desired_monthly_income for Pension to 70% of income: ${g.desired_monthly_income}`);
                    }
                }

                return { goal: g, index: i };
            }).sort((a, b) => {
                const pA = a.goal.priority || this._getPriority(a.goal);
                const pB = b.goal.priority || this._getPriority(b.goal);
                if (pA !== pB) return pA - pB;
                return (a.goal.term_months || 0) - (b.goal.term_months || 0);
            });

            logger.info(`[CalculationService] Ordered goals: ${indexedGoals.map(g => g.goal.id).join(', ')}`);

            // 2.1. Smart Allocation (Burden-Based)
            // Skip if restricted by options OR if we are in partial mode and have previous results
            // User requested: Smart Allocation only for "First Run" (Onboarding)
            if (isFirstRun && (!targetGoalId || !previousCalculation)) {
                logger.info('[CalculationService] Running Full Smart Allocation (First Run)...');
                await this._calculateSmartAllocation(indexedGoals, context);
            } else {
                logger.info(`[CalculationService] Skipping Smart Allocation (Recalculate Mode or Target Set). isFirstRun: ${isFirstRun}, target: ${targetGoalId}`);
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
                        logger.info(`[CalculationService] Set capital ${goal.smart_initial_capital} for goal ${goal.name} (Frozen/Target)`);
                    }
                }
            }

            const resultsIndexed = [];

            // 3. Main Loop
            for (const { goal, index } of indexedGoals) {
                const currentGoalId = String(goal.id || goal.goal_id);
                const isTarget = !targetGoalId || currentGoalId === String(targetGoalId);

                // [RISK PROFILE] Auto-calculate risk profile based on Dengina methodology
                if (isTarget && clientData.risk_profile_answers) {
                    let answers = clientData.risk_profile_answers;
                    if (typeof answers === 'string') {
                        try { answers = JSON.parse(answers); } catch (e) { }
                    }

                    if (answers && typeof answers === 'object') {
                        // Front может присылать `{}` (нет ответов). Тогда не должны затирать `goal.risk_profile`,
                        // потому что авто-методика использует ответы Q2-Q10 + баллы за горизонт (Q1).
                        const hasAnyQ2toQ10Answer = ['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10']
                            .some(k => answers[k] !== undefined && answers[k] !== null && answers[k] !== '');

                        if (!hasAnyQ2toQ10Answer) {
                            // Nothing to auto-calculate; keep risk_profile coming from the goal (front).
                        } else {
                        const term = goal.term_months || 0;
                        const calculatedProfile = riskProfileService.calculateGoalProfile(answers, term);

                        if (calculatedProfile) {
                            logger.info(`[CalculationService] Auto-calculated risk profile for ${goal.name}: ${calculatedProfile} (term: ${term}mo)`);
                            goal.risk_profile = calculatedProfile;
                        }
                        }
                    }
                }

                if (isTarget) {
                    const typeId = goal.goal_type_id;
                    const CalculatorClass = CALCULATORS[typeId] || otherGoalCalculator;

                    try {
                        const calculator = (typeof CalculatorClass === 'function') ? new CalculatorClass() : CalculatorClass;
                        const result = await calculator.calculate(goal, context);

                        const wrappedResult = {
                            ...result,
                            goal_name: goal.name || goal.goal_name || result.goal_name || result.name || goal.goal_type || 'Цель',
                            goal_type: result.goal_type || goal.goal_type || 'OTHER',
                            goal_type_id: result.goal_type_id || goal.goal_type_id,
                            goal_id: result.goal_id || goal.id || goal.goal_id,
                            risk_profile: goal.risk_profile
                        };

                        resultsIndexed.push({ index, result: wrappedResult });
                    } catch (err) {
                        logger.error(`[CalculationService] Calculation error for goal ${goal.name} (ID: ${goal.id}):`, err);
                        resultsIndexed.push({
                            index,
                            result: {
                                goal_id: goal.id || goal.goal_id || null,
                                goal_name: goal.name || goal.goal_name || 'Ошибка расчета',
                                goal_type_id: goal.goal_type_id,
                                goal_type: goal.goal_type || 'OTHER',
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

                        // Ensure goal_id and goal_name exist in the frozen result
                        const finalFrozenResult = {
                            ...prevResult,
                            goal_id: prevResult.goal_id || goal.id || goal.goal_id,
                            goal_name: goal.name || goal.goal_name || prevResult.goal_name || prevResult.name || goal.goal_type || 'Цель',
                            goal_type: prevResult.goal_type || goal.goal_type || 'OTHER',
                            risk_profile: goal.risk_profile || prevResult.risk_profile
                        };

                        resultsIndexed.push({ index, result: finalFrozenResult });
                    } else {
                        // Fallback if no previous result found (should not happen in valid partial mode)
                        console.warn(`[CalculationService] No previous result for frozen goal ${goal.name}, calculating anyway.`);
                        const calculator = (typeof CALCULATORS[goal.goal_type_id] === 'function')
                            ? new CALCULATORS[goal.goal_type_id]()
                            : (CALCULATORS[goal.goal_type_id] || otherGoalCalculator);
                        const result = await calculator.calculate(goal, context);
                        const wrappedResult = {
                            ...result,
                            goal_name: goal.name || goal.goal_name || result.goal_name || result.name || goal.goal_type || 'Цель',
                            goal_type: result.goal_type || goal.goal_type || 'OTHER',
                            goal_type_id: result.goal_type_id || goal.goal_type_id,
                            goal_id: result.goal_id || goal.id || goal.goal_id
                        };
                        resultsIndexed.push({ index, result: wrappedResult });
                    }
                }
            }

            // 4. Aggregate Results
            const results = resultsIndexed
                .sort((a, b) => a.index - b.index)
                .map(item => item.result);

            const consolidatedPortfolio = await portfolioAggregator.aggregate(results, context);

            // Calculate Age
            const birthDate = new Date(client.birth_date);
            const ageDifMs = Date.now() - birthDate.getTime();
            const ageDate = new Date(ageDifMs);
            const age = Math.abs(ageDate.getUTCFullYear() - 1970);

            const investmentExpenseGrowthPercent = context.investmentExpenseGrowthAnnualPercent != null
                ? Math.round(context.investmentExpenseGrowthAnnualPercent * 100) / 100
                : null;

            return {
                client_id: data.client_id || (client ? client.id : null),
                // Рост расходов на инвестиции (% годовых) — на верхнем уровне для удобства
                investment_expense_growth_annual_percent: investmentExpenseGrowthPercent,
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

                    consolidated_portfolio: consolidatedPortfolio,
                    tax_benefits_summary: this._generateTaxBenefitsSummary(results),

                    // Рост расходов на инвестиции (% годовых), использованный в расчёте
                    investment_expense_growth_annual_percent: investmentExpenseGrowthPercent
                },
                goals: results
            };
        } catch (err) {
            console.error('[CalculationService] calculateFirstRun error:', err);
            throw err;
        }
    }

    /**
     * Generate Tax Benefits Summary (PDS + NSJ)
     * Aggregates tax deductions and cofinancing from all goals for frontend display
     */
    _generateTaxBenefitsSummary(results) {
        let pdsTotalDeductions = 0;
        let pdsTotalCofinancing = 0;
        let iisTotalDeductions = 0;
        let childrenTotalDeductions = 0;

        let nsjAnnualPremium = 0;
        let nsjDeduction2026 = 0;
        let nsjTotalDeductions = 0;

        let pdsDeduction2026 = 0;
        let pdsCofinancing2026 = 0;
        let iisDeduction2026 = 0;
        let childrenDeduction2026 = 0;

        // Collect from all goals
        results.forEach(result => {
            if (result.details) {
                const isLifeGoal = result.goal_type_id === 5 || result.goal_type === 'LIFE';
                const hasBreakdown = Array.isArray(result.details.yearly_breakdown)
                    && result.details.yearly_breakdown.some((row) => row.tax_refund_breakdown);
                const taxRef = result.details.total_tax_deductions_nominal || result.details.total_tax_refund || result.summary?.total_tax_benefit || 0;
                if (!isLifeGoal && !hasBreakdown) {
                    pdsTotalDeductions += taxRef;
                }

                // PDS cofinancing
                const cofin = result.details.total_cofinancing_nominal || result.details.total_cofinancing || result.summary?.total_cofinancing || 0;
                pdsTotalCofinancing += cofin;

                // NSJ from Life goal
                if (isLifeGoal) {
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
                        const br = year2027.tax_refund_breakdown || {};
                        const hasBreakdown = Number(br.pds || 0) + Number(br.iis || 0) + Number(br.children || 0) > 0;
                        pdsDeduction2026 += hasBreakdown ? Number(br.pds || 0) : Number(year2027.tax_refund_projected || 0);
                        iisDeduction2026 += Number(br.iis || 0);
                        childrenDeduction2026 += Number(br.children || 0);
                        pdsCofinancing2026 += (year2027.cofinancing_for_year || 0);
                    }

                    result.details.yearly_breakdown.forEach((row) => {
                        const br = row.tax_refund_breakdown || {};
                        if (!br || typeof br !== 'object') return;
                        pdsTotalDeductions += Number(br.pds || 0);
                        iisTotalDeductions += Number(br.iis || 0);
                        childrenTotalDeductions += Number(br.children || 0);
                    });
                }
            }
        });

        const totalDeduction2026 = Math.round((pdsDeduction2026 + iisDeduction2026 + childrenDeduction2026 + nsjDeduction2026) * 100) / 100;
        const totalCofinancing2026 = Math.round(pdsCofinancing2026 * 100) / 100;

        const totalDeductionsAll = Math.round((pdsTotalDeductions + iisTotalDeductions + childrenTotalDeductions + nsjTotalDeductions) * 100) / 100;
        const totalCofinancingAll = Math.round(pdsTotalCofinancing * 100) / 100;

        return {
            pds_benefits: {
                deduction_2026: Math.round(pdsDeduction2026 * 100) / 100,
                cofinancing_2026: Math.round(pdsCofinancing2026 * 100) / 100,
                total_deductions: Math.round(pdsTotalDeductions * 100) / 100,
                total_cofinancing: Math.round(pdsTotalCofinancing * 100) / 100
            },
            iis_benefits: {
                deduction_2026: Math.round(iisDeduction2026 * 100) / 100,
                total_deductions: Math.round(iisTotalDeductions * 100) / 100
            },
            children_benefits: {
                deduction_2026: Math.round(childrenDeduction2026 * 100) / 100,
                total_deductions: Math.round(childrenTotalDeductions * 100) / 100
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

    /**
     * Simplify calculation result by removing yearly_breakdown from goals
     * and ensuring field order for core properties.
     */
    simplify(result) {
        if (!result) return result;

        // If it's a client object with goals_summary
        if (result.goals_summary) {
            result.goals_summary = this.simplify(result.goals_summary);
            return result;
        }

        // Handle case where result is wraped in { calculation: ... } or is the calc object itself
        const calc = result.calculation || result;

        if (calc.goals && Array.isArray(calc.goals)) {
            calc.goals = calc.goals.map(goal => {
                // Ensure field order and remove yearly_breakdown
                const { goal_name, goal_type, goal_type_id, goal_id, ...rest } = goal;

                if (rest.details && rest.details.yearly_breakdown) {
                    delete rest.details.yearly_breakdown;
                }

                // Reconstruct with guaranteed order
                return {
                    goal_name: goal_name || goal.name,
                    goal_type,
                    goal_type_id,
                    goal_id,
                    ...rest
                };
            });
        }

        return result;
    }

    // Consolidated Portfolio logic moved to PortfolioAggregator.js
}

module.exports = new CalculationService();
