const TaxService = require('../TaxService');
const settingsService = require('../../services/settingsService');

/** @param {Date} d */
function formatScheduleDate(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

class BaseCalculator {
    /**
     * @param {Object} goal - Goal data
     * @param {Object} context - Unified context (client, settings, services, repo)
     */
    async calculate(goal, context) {
        throw new Error('calculate() must be implemented');
    }

    /**
     * Превращает годовую доходность в месячную
     */
    getMonthlyYield(annualYieldPercent) {
        return Math.pow(1 + (annualYieldPercent / 100), 1 / 12) - 1;
    }

    /**
     * Превращает годовую инфляцию в месячную
     */
    getMonthlyInflation(annualInflationPercent) {
        return Math.pow(1 + (annualInflationPercent / 100), 1 / 12) - 1;
    }

    /**
     * Ставка инфляции (годовая %) для месяца m (0-based) из матрицы.
     * matrix: { ranges: [ { fromMonth, toMonthExcl, rateAnnual }, ... ] }
     * Если месяц вне всех диапазонов — берётся ставка последней линии.
     * @returns {number|null} rateAnnual или null если матрицы нет/пуста
     */
    getInflationRateForMonth(matrix, m) {
        if (!matrix || !Array.isArray(matrix.ranges) || matrix.ranges.length === 0) return null;
        const ranges = matrix.ranges;
        for (const r of ranges) {
            const from = r.fromMonth ?? r.from_month ?? 0;
            const toExcl = r.toMonthExcl ?? r.to_month_excl ?? r.toMonth ?? Infinity;
            if (m >= from && m < toExcl) return Number(r.rateAnnual ?? r.rate_annual ?? 0);
        }
        const last = ranges[ranges.length - 1];
        return Number(last.rateAnnual ?? last.rate_annual ?? 0);
    }

    /**
     * Обработка событий ПДС (Софинансирование и Налоговый вычет)
     * @param {number} month - текущий месяц (1-12)
     * @param {number} year - текущий год
     * @param {number} startYear - год начала
     * @param {Object} yearlyContributions - взносы по годам
     * @param {number} avgMonthlyIncome - доход клиента
     * @param {Object} context - контекст с лимитами
     */
    async handlePdsEvents(month, year, startYear, yearlyContributions, avgMonthlyIncome, context) {
        let cofin = 0;
        let refund = 0;

        // 1. Софинансирование (Август)
        if (month === 8 && year > startYear) {
            const prevYear = year - 1;
            if (prevYear - startYear < 10 && yearlyContributions[prevYear]) {
                const alreadyUsed = context.usedCofinancingPerYear[prevYear] || 0;
                const remainingLimit = Math.max(0, 36000 - alreadyUsed);

                if (remainingLimit > 0) {
                    const cofinResult = await settingsService.calculatePdsCofinancing(
                        yearlyContributions[prevYear],
                        avgMonthlyIncome,
                        remainingLimit,
                        context.cachedData, // Pass cached data
                        context.projectId
                    );
                    const benefit = cofinResult.state_cofin_amount || 0;
                    if (benefit > 0) {
                        cofin += benefit;
                        context.usedCofinancingPerYear[prevYear] = alreadyUsed + benefit;
                    }
                }
            }
        }

        // 2. Налоговый вычет (Апрель)
        if (month === 4 && year > startYear) {
            const prevYear = year - 1;
            const prevContrib = yearlyContributions[prevYear] || 0;
            if (prevContrib > 0) {
                const alreadyUsedBase = context.usedTaxBasePerYear[prevYear] || 0;
                const remainingBase = Math.max(0, 400000 - alreadyUsedBase);

                if (remainingBase > 0) {
                    const dedRes = await TaxService.calculatePdsRefundDelta(
                        avgMonthlyIncome * 12,
                        prevContrib,
                        alreadyUsedBase,
                        prevYear,
                        context.cachedData ? context.cachedData.taxBrackets : null, // Pass cached tax brackets
                        context.projectId
                    );
                    const refundAmount = dedRes.refundAmount;

                    if (refundAmount > 0) {
                        refund += refundAmount;
                        context.usedTaxBasePerYear[prevYear] = alreadyUsedBase + dedRes.contributionAdded;
                    }
                }
            }
        }

        return { cofin, refund };
    }

    /**
     * Основное ядро симуляции (Excel-aligned)
     */
    async runSimulation(params, context) {
        const {
            initialCapital,
            monthlyReplenishment,
            termMonths,
            monthlyYieldRate,
            indexationRate,
            pdsProductId,
            avgMonthlyIncome,
            startDate = new Date(),
            collectMonthlySchedule = false
        } = params;

        let currentBalance = initialCapital;
        let totalClientInvestment = initialCapital;
        let totalCofinancing = 0;
        let totalTaxRefund = 0;
        let totalStateBenefit = 0;

        // Клонируем лимиты, чтобы не "загрязнять" контекст при бинарном поиске
        const localUsedCofinancing = { ...(context.usedCofinancingPerYear || {}) };
        const localUsedTaxBase = { ...(context.usedTaxBasePerYear || {}) };

        let currentDate = new Date(startDate);
        // В Excel капитал No 0 фиксируется в 1-й месяц. Рост и пополнения со 2-го.
        currentDate.setMonth(currentDate.getMonth() + 1);
        const startYear = startDate.getFullYear();
        const yearlyContributions = {};
        const yearly_breakdown_log = [];
        const pdsEventsLog = {}; // Track {year: {cofin, refund}}
        const monthlySchedule = [];

        if (initialCapital > 0) {
            yearlyContributions[startYear] = (yearlyContributions[startYear] || 0) + initialCapital;
        }

        // Первая строка графика — календарный месяц старта: взнос = первоначальный капитал, без доходности/ПДС в этой строке.
        if (collectMonthlySchedule && initialCapital > 0) {
            const anchor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            monthlySchedule.push({
                date: formatScheduleDate(anchor),
                replenishment: Math.round(initialCapital * 100) / 100,
                total_capital: Math.round(initialCapital * 100) / 100,
                tax_deduction: 0,
                cofinancing: 0,
                schedule_row_kind: 'INITIAL_LUMP',
            });
        }

        for (let m = 1; m <= termMonths; m++) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;

            // 1. Рост капитала
            currentBalance *= (1 + monthlyYieldRate);

            // 2. Пополнение
            const indexedReplenishment = monthlyReplenishment * Math.pow(1 + indexationRate, m - 1);
            currentBalance += indexedReplenishment;
            totalClientInvestment += indexedReplenishment;
            yearlyContributions[year] = (yearlyContributions[year] || 0) + indexedReplenishment;

            // 2.1 Inflows (Additional Liquidity)
            if (params.inflows && params.inflows.length > 0) {
                const monthInflows = params.inflows.filter(i => i.month === m);
                for (const inf of monthInflows) {
                    currentBalance += inf.amount;
                    // Note: We do NOT add to totalClientInvestment as this is transfer of existing assets
                }
            }

            let monthCofin = 0;
            let monthRefund = 0;

            // 3. ПДС события
            if (pdsProductId) {
                // Создаем временный контекст для handlePdsEvents
                const tempContext = {
                    ...context,
                    usedCofinancingPerYear: localUsedCofinancing,
                    usedTaxBasePerYear: localUsedTaxBase
                };
                const { cofin, refund } = await this.handlePdsEvents(month, year, startYear, yearlyContributions, avgMonthlyIncome, tempContext);
                monthCofin = cofin;
                monthRefund = refund;
                currentBalance += (cofin + refund);
                totalCofinancing += cofin;
                totalTaxRefund += refund;
                totalStateBenefit += (cofin + refund);

                // Log per year
                if (!pdsEventsLog[year]) pdsEventsLog[year] = { cofin: 0, refund: 0 };
                pdsEventsLog[year].cofin += cofin;
                pdsEventsLog[year].refund += refund;
            }

            if (collectMonthlySchedule) {
                monthlySchedule.push({
                    date: formatScheduleDate(currentDate),
                    replenishment: Math.round(indexedReplenishment * 100) / 100,
                    total_capital: Math.round(currentBalance * 100) / 100,
                    tax_deduction: Math.round(monthRefund * 100) / 100,
                    cofinancing: Math.round(monthCofin * 100) / 100
                });
            }

            // 4. Log for breakdown
            if (month === 12 || m === termMonths) {
                // Approximate yearly log at end of year (or end of term)
                yearly_breakdown_log.push({
                    year: year,
                    month: month,
                    tax_refund_projected: params.pdsProductId ? totalTaxRefund : 0, // Cumulative or yearly? Service expects yearly benefit for check?
                    // actually CalculationService.js checks `year2026.tax_refund_projected`. 
                    // To show "for 2026", we need the amount GENERATED in 2026 (received in 2027).
                    // handlePdsEvents returns {cofin, refund} for that specific event.
                    // We should track annual amounts.
                    cofinancing_for_year: (pdsEventsLog[year]?.cofin || 0),
                    tax_refund_projected: (pdsEventsLog[year]?.refund || 0)
                });
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        return {
            totalCapital: currentBalance,
            totalClientInvestment,
            totalStateBenefit,
            totalCofinancing,
            totalTaxRefund,
            yearlyContributions: yearlyContributions,
            // Возвращаем обновленные лимиты
            usedCofinancingPerYear: localUsedCofinancing,
            usedTaxBasePerYear: localUsedTaxBase,
            yearlyBreakdown: yearly_breakdown_log, // Return the log
            monthlySchedule
        };
    }

    /**
     * Симуляция накопления для поиска необходимого пополнения
     */
    async simulateGoal(params, context) {
        const {
            targetAmountFuture,
            ...simParams
        } = params;

        // Обертка над runSimulation для бинарного поиска
        const check = async (mReplen) => {
            const res = await this.runSimulation({
                ...simParams,
                monthlyReplenishment: mReplen,
                collectMonthlySchedule: false
            }, context);
            return res.totalCapital;
        };

        if ((await check(0)) >= targetAmountFuture) return 0;

        let low = 0;
        let high = targetAmountFuture;
        // Бинарный поиск
        for (let i = 0; i < 40; i++) {
            let mid = (low + high) / 2;
            const val = await check(mid);
            if (val < targetAmountFuture) {
                low = mid;
            } else {
                high = mid;
            }
        }
        return high;
    }

    /**
     * Deducts a specific amount from the shared pool events (waterfall).
     * Modifies context.sharedPoolEvents in place.
     * @returns {number} The actual amount deducted.
     */
    /**
     * Resolves initial capital for a goal.
     * If smart_initial_capital is present, it means it was ALREADY deducted from the pool
     * in CalculationService._calculateSmartAllocation, so we just return it.
     * Otherwise, we try to deduct from the shared pool waterfall.
     */
    resolveInitialCapital(goal, context) {
        if (goal.smart_initial_capital !== undefined && goal.smart_initial_capital !== null) {
            return Number(goal.smart_initial_capital);
        }
        // Fallback for manual or legacy mode
        const needed = Number(goal.initial_capital || 0);
        return this.deductFromSharedPool(needed, context);
    }

    deductFromSharedPool(amountNeeded, context) {
        // Use Smart Allocation suggestion if available (this overrides amountNeeded from user input)
        // Check if the goal object has smart_initial_capital attached (we need access to goal object here? 
        // Wait, calculate(goal, context) calls this using 'amountNeeded' derived from goal.initial_capital.
        // We should change the CALLER, or pass the goal here.
        // But amountNeeded is usually 'goal.initial_capital'.
        // Actually, let's change the pattern: The Calculator should look at smart_initial_capital FIRST.


        let remaining = amountNeeded;
        let takenTotal = 0;

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
     * Распределение свободных активов (Shared Pool) по целям
     */
    getGoalInflows(goal, assets, context, termMonths, initialCapital, targetAmountFuture, yieldMonthly, inflationMonthly, replenishment = 0) {
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

            if (gapFuture > 0 && context.usePool !== false) {
                for (const event of context.sharedPoolEvents) {
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


    /**
     * Calculates the weighted annual yield of a portfolio based on goal duration and capital.
     * Shared logic for Investment, FinReserve, and Rent.
     * @param {Object} portfolio - The portfolio object with riskProfiles.
     * @param {Object} goal - The goal object (needs initial_capital and term_months).
     * @param {Object} productRepository - Repository to fetch products.
     * @returns {Promise<number>} Weighted annual yield percentage (e.g. 0.15 for 15%).
     */
    async calculateWeightedYield(portfolio, goal, productRepository, projectId = null) {
        let riskProfiles = portfolio.riskProfiles || portfolio.risk_profiles || [];

        if (typeof riskProfiles === 'string') {
            try {
                riskProfiles = JSON.parse(riskProfiles);
            } catch (e) {
                // ignore, remains string/invalid
            }
        }

        if (!Array.isArray(riskProfiles)) {
            // Log for debugging before throwing
            console.error('CRITICAL ERROR: riskProfiles is not an array in calculateWeightedYield!');
            console.error('Portfolio ID:', portfolio.id);
            throw new Error(`Invalid riskProfiles format for portfolio ${portfolio.id}`);
        }

        if (riskProfiles.length === 0) {
            console.warn(`Warning: No risk profiles found for portfolio ${portfolio.id}`);
            // We can throw or return a default. User requested throwing specific error.
            throw new Error('No risk profiles found for portfolio');
        }

        const searchProfile = (goal.risk_profile || 'BALANCED').toUpperCase();
        const profile = riskProfiles.find(p => {
            const pType = (p.risk_profile || p.profile_type || '').toUpperCase();
            return pType === searchProfile;
        });

        if (!profile) {
            throw new Error(`Risk profile ${searchProfile} not found in portfolio`);
        }

        let weightedYieldAnnual = 0;
        let allBuckets = [];

        if (profile.instruments && profile.instruments.length > 0) {
            allBuckets = profile.instruments;
        } else {
            // Legacy format support
            if (profile.initial_capital) {
                allBuckets.push(...profile.initial_capital.map(i => ({ ...i, bucket_type: 'INITIAL_CAPITAL' })));
            }
            const replenishment = profile.initial_replenishment || profile.top_up || profile.monthly_savings;
            if (replenishment) {
                allBuckets.push(...replenishment.map(i => ({ ...i, bucket_type: 'TOP_UP' })));
            }
        }

        const initial_instruments = [];
        const monthly_instruments = [];
        let pdsProductId = null;

        for (const item of allBuckets) {
            const product = await productRepository.findById(item.product_id, projectId);
            if (!product) continue;

            const prodType = (product.product_type || '').toUpperCase().trim();
            if (prodType === 'PDS') pdsProductId = product.id;

            const calcInitial = (goal.smart_initial_capital !== undefined) ? Number(goal.smart_initial_capital) : Number(goal.initial_capital || 0);
            const allocatedAmount = Math.max(calcInitial * (item.share_percent / 100), 1);
            const yields = product.yields || [];
            const line = yields.find(l =>
                goal.term_months >= l.term_from_months &&
                goal.term_months <= l.term_to_months &&
                allocatedAmount >= parseFloat(l.amount_from) &&
                allocatedAmount <= parseFloat(l.amount_to)
            ) || yields[0];

            const productYield = line ? parseFloat(line.yield_percent) : 0;

            // Short-term yield: ищем доходность с минимальным сроком для ЭТОЙ суммы
            const matchingAmountRows = yields.filter(l =>
                allocatedAmount >= parseFloat(l.amount_from) &&
                allocatedAmount <= parseFloat(l.amount_to)
            );
            const shortTermLine = matchingAmountRows.length > 0
                ? matchingAmountRows.reduce((min, l) =>
                    (parseFloat(l.term_to_months) || 999) < (parseFloat(min.term_to_months) || 999) ? l : min
                    , matchingAmountRows[0])
                : null;
            const shortTermYield = shortTermLine ? parseFloat(shortTermLine.yield_percent) : productYield;

            const instrumentData = {
                name: product.name,
                share: item.share_percent,
                yield: productYield,
                short_term_yield: shortTermYield
            };

            const bType = (item.bucket_type || 'INITIAL_CAPITAL').toUpperCase().trim();
            if (bType === 'INITIAL_CAPITAL') {
                initial_instruments.push(instrumentData);
                weightedYieldAnnual += (productYield * (item.share_percent / 100));
            } else if (bType === 'MONTHLY_SAVINGS' || bType === 'TOP_UP') {
                monthly_instruments.push(instrumentData);
            }
        }

        return {
            weightedYieldAnnual: weightedYieldAnnual,
            initial_instruments,
            monthly_instruments,
            pdsProductId
        };
    }
}

module.exports = BaseCalculator;
