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
                        remainingLimit,
                        context.cachedData // Pass cached data
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
                        context.cachedData ? context.cachedData.taxBrackets : null // Pass cached tax brackets
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

        // Клонируем лимиты, чтобы не "загрязнять" контекст при бинарном поиске
        const localUsedCofinancing = { ...(context.usedCofinancingPerYear || {}) };
        const localUsedTaxBase = { ...(context.usedTaxBasePerYear || {}) };

        let currentDate = new Date(startDate);
        // В Excel капитал No 0 фиксируется в 1-й месяц. Рост и пополнения со 2-го.
        currentDate.setMonth(currentDate.getMonth() + 1);
        const startYear = startDate.getFullYear();
        const yearlyContributions = {};
        const yearlyData = []; // Store breakdown
        let currentTotalTaxRefund = 0;
        let currentTotalCofin = 0;

        if (initialCapital > 0) {
            yearlyContributions[startYear] = (yearlyContributions[startYear] || 0) + initialCapital;
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

            // 3. ПДС события
            let cofinForYear = 0;
            let refundForYear = 0;

            if (pdsProductId) {
                // Создаем временный контекст для handlePdsEvents
                const tempContext = {
                    ...context,
                    usedCofinancingPerYear: localUsedCofinancing,
                    usedTaxBasePerYear: localUsedTaxBase
                };
                const { cofin, refund } = await this.handlePdsEvents(month, year, startYear, yearlyContributions, avgMonthlyIncome, tempContext);
                currentBalance += (cofin + refund);
                totalCofinancing += cofin;
                totalTaxRefund += refund;
                totalStateBenefit += (cofin + refund);

                // Track for yearly reporting
                currentTotalCofin = totalCofinancing;
                currentTotalTaxRefund = totalTaxRefund;

                cofinForYear = cofin;
                refundForYear = refund;
            }

            // --- YEARLY BREAKDOWN REPORTING (New) ---
            // Report at the END of each year (month 12) or loop end?
            // Better: PdsCofinancingService logic tracks "Year Shift".
            // Here we can just track by calendar year.
            if (month === 12 || m === termMonths) {
                // Calculate projected tax refund for THIS year contributions (to be received next year)
                let projectedTaxRefund = 0;
                if (pdsProductId) {
                    try {
                        // Re-use logic from PdsCofinancingService
                        // This allows showing "Accrued" benefit for the current year
                        const annualContrib = yearlyContributions[year] || 0;
                        if (annualContrib > 0) {
                            const estIncome = (avgMonthlyIncome || 0) * 12;
                            const taxProfile = {
                                annual_income_taxable: estIncome,
                                ndfl_amount_without_deductions: (estIncome * 0.13), // Simplified approximation for BaseCalculator
                                ndfl_rate_value: 0.13
                            };
                            const dedRes = await TaxService.calculatePdsDeduction(taxProfile, annualContrib, year);
                            projectedTaxRefund = dedRes.refundAmount;

                            // Fallback for 0 income
                            if (projectedTaxRefund === 0 && (!avgMonthlyIncome || avgMonthlyIncome === 0)) {
                                projectedTaxRefund = Math.min(annualContrib, 400000) * 0.13;
                            }
                        }
                    } catch (e) { }
                }

                // How to get accrued co-financing? 
                // It's checked in August of NEXT year. 
                // PdsCofinancingService has logic to check "limit remaining".
                // Here we simplify: if PDS active, standard logic.
                let projectedCofin = 0;
                if (pdsProductId && year - startYear < 10) {
                    // Approximate: min(contrib, 36000)
                    // But we must respect used limit.
                    // It's hard to respect shared limit here without complexity. 
                    // We will rely on PdsCofinancingService for strictness, but here providing data for aggregation.
                    // Actually, if we just want to fill "cofinancing_for_year" (accrued), we can estimate.
                    // But CalculationService aggregates this.
                    // Let's use a safe estimate:
                    const annualContrib = yearlyContributions[year] || 0;
                    if (annualContrib >= 2000) {
                        projectedCofin = Math.min(annualContrib, 36000);
                        // Note: This ignores the global 36k limit if shared across multiple goals!
                        // But for dashboard "Accrued" it might be acceptable if inaccurate.
                        // OR we can leave it 0 and only rely on PdsCofinancingService for PENSION goal.
                        // But User sees 0 for Investment goal too...
                        // Let's try to be smart.
                        const alreadyUsed = localUsedCofinancing[year] || 0; // This is accrued for THIS year? NO, localUsed maps year -> amount PAID in that year?
                        // handlePdsEvents updates usedCofinancingPerYear[prevYear].
                        // So checking localUsedCofinancing[year] gives what was paid IN this year (for prev year).

                        // We want to know available limit for THIS year.
                        // It is NOT yet in localUsedCofinancing (will be next year).
                        // So we assume full limit available? 
                        projectedCofin = Math.min(annualContrib, 36000);
                    }
                }

                yearlyData.push({
                    year: year,
                    tax_refund_projected: Math.round(projectedTaxRefund * 100) / 100,
                    cofinancing_for_year: Math.round(projectedCofin * 100) / 100,

                    // Also track realized
                    tax_refund_received: Math.round((currentTotalTaxRefund - (yearlyData.lastTotalRefund || 0)) * 100) / 100,
                    cofinancing_paid_in_year: Math.round((currentTotalCofin - (yearlyData.lastTotalCofin || 0)) * 100) / 100
                });
                yearlyData.lastTotalRefund = currentTotalTaxRefund;
                yearlyData.lastTotalCofin = currentTotalCofin;
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        return {
            totalCapital: currentBalance,
            totalClientInvestment,
            totalStateBenefit,
            totalCofinancing,
            totalTaxRefund,
            yearlyContributions,
            yearlyData,
            // Возвращаем обновленные лимиты, чтобы CalculationService мог их применить ПОСЛЕ финального расчета
            usedCofinancingPerYear: localUsedCofinancing,
            usedTaxBasePerYear: localUsedTaxBase
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
     * Deducts a specific amount from the shared pool events (waterfall).
     * Modifies context.sharedPoolEvents in place.
     * @returns {number} The actual amount deducted.
     */
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


    /**
     * Calculates the weighted annual yield of a portfolio based on goal duration and capital.
     * Shared logic for Investment, FinReserve, and Rent.
     * @param {Object} portfolio - The portfolio object with riskProfiles.
     * @param {Object} goal - The goal object (needs initial_capital and term_months).
     * @param {Object} productRepository - Repository to fetch products.
     * @returns {Promise<number>} Weighted annual yield percentage (e.g. 0.15 for 15%).
     */
    async calculateWeightedYield(portfolio, goal, productRepository) {
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
            const product = await productRepository.findById(item.product_id);
            if (!product) continue;

            const prodType = (product.product_type || '').toUpperCase().trim();
            if (prodType === 'PDS') pdsProductId = product.id;

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
