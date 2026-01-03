const TaxService = require('../TaxService');
const settingsService = require('../settingsService');

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
                        remainingLimit
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
                        prevYear
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
            startDate = new Date()
        } = params;

        let currentBalance = initialCapital;
        let totalClientInvestment = initialCapital;
        let totalCofinancing = 0;
        let totalTaxRefund = 0;
        let totalStateBenefit = 0;

        let currentDate = new Date(startDate);
        // В Excel капитал No 0 фиксируется в 1-й месяц. Рост и пополнения со 2-го.
        currentDate.setMonth(currentDate.getMonth() + 1);
        const startYear = startDate.getFullYear();
        const yearlyContributions = {};

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

            // 3. ПДС события
            if (pdsProductId) {
                const { cofin, refund } = await this.handlePdsEvents(month, year, startYear, yearlyContributions, avgMonthlyIncome, context);
                currentBalance += (cofin + refund);
                totalCofinancing += cofin;
                totalTaxRefund += refund;
                totalStateBenefit += (cofin + refund);
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        return {
            totalCapital: currentBalance,
            totalClientInvestment,
            totalStateBenefit,
            totalCofinancing,
            totalTaxRefund,
            yearlyContributions
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
                monthlyReplenishment: mReplen
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

            if (gapFuture > 0) {
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
}

module.exports = BaseCalculator;
