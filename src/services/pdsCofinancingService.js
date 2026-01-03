const settingsService = require('./settingsService');
const productRepository = require('../repositories/productRepository');

/**
 * Максимальный срок софинансирования ПДС (лет)
 */
const MAX_COFINANCING_YEARS = 10;

/**
 * Месяц начисления софинансирования (август)
 */
const COFINANCING_MONTH = 8;

/**
 * Базовый лимит софинансирования в год
 */
const BASE_ANNUAL_LIMIT = 36000;

class PdsCofinancingService {
    /**
     * Рассчитать эффект софинансирования ПДС с учетом ежегодных лимитов
     * 
     * @param {Object} params - Параметры расчета
     * @param {Object} [params.usedCofinancingPerYear] - Объект {год: уже_использовано}, для учета лимита по нескольким целям
     * @returns {Promise<Object>} Результат расчета софинансирования
     */
    async calculateCofinancingEffect(params) {
        const {
            capitalGap,
            initialReplenishment,
            initialCapital,
            pdsShareInitial,
            pdsShareTopUp,
            pdsProductId,
            termMonths,
            avgMonthlyIncome,
            startDate = new Date(),
            monthlyGrowthRate,
            portfolioYieldMonthly,
            usedCofinancingPerYear = {}
        } = params;

        // Если доля ПДС = 0, возвращаем исходные значения
        if (pdsShareTopUp === 0 && pdsShareInitial === 0) {
            return {
                recommendedReplenishment: initialReplenishment,
                cofinancing_next_year: 0,
                total_cofinancing_nominal: 0,
                total_cofinancing_with_investment: 0,
                yearly_breakdown: [],
                pds_applied: false,
                actualUsedCofinancingPerYear: {},
                total_tax_deductions_nominal: 0,
                total_tax_deductions_with_investment: 0
            };
        }

        // Получаем продукт ПДС
        const pdsProduct = await productRepository.findById(pdsProductId);
        if (!pdsProduct) {
            throw new Error(`PDS product with id ${pdsProductId} not found`);
        }

        const pdsInitialCapital = initialCapital * (pdsShareInitial / 100);
        const pdsYieldAnnual = this._findPdsYield(pdsProduct, pdsInitialCapital, termMonths);
        if (pdsYieldAnnual === null) {
            throw new Error(`PDS yield not found for capital ${pdsInitialCapital} and term ${termMonths} months`);
        }
        const pdsYieldMonthly = Math.pow(1 + (pdsYieldAnnual / 100), 1 / 12) - 1;

        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const startYear = start.getFullYear();
        const startMonth = start.getMonth() + 1;

        let cofinancingStartYear = startYear;
        if (pdsInitialCapital <= 0 && startMonth === 12) {
            cofinancingStartYear = startYear + 1;
        }

        // --- FIRST PASS: Estimate total co-financing ---
        const firstPass = await this._runSimulation({
            pdsInitialCapital,
            monthlyPdsReplenishment: initialReplenishment * (pdsShareTopUp / 100),
            pdsYieldMonthly,
            termMonths,
            startYear,
            startMonth,
            cofinancingStartYear,
            monthlyGrowthRate,
            avgMonthlyIncome,
            usedCofinancingPerYear,
            passName: "Pass 1"
        });

        const totalCofinancingWithInvestment = firstPass.stateCapital;
        const totalTaxCapital = firstPass.taxCapital;

        let recommendedReplenishment = initialReplenishment;
        if (capitalGap > 0) {
            // Subtract BOTH State Co-financing AND Tax Refunds from the gap
            const newCapitalGap = capitalGap - (totalCofinancingWithInvestment + totalTaxCapital);
            if (newCapitalGap > 0 && portfolioYieldMonthly !== undefined) {
                recommendedReplenishment = this._recalculateReplenishment(
                    newCapitalGap,
                    termMonths,
                    monthlyGrowthRate,
                    portfolioYieldMonthly
                );
            } else if (newCapitalGap <= 0) {
                recommendedReplenishment = 0;
            }
        }

        const secondPass = await this._runSimulation({
            pdsInitialCapital,
            monthlyPdsReplenishment: recommendedReplenishment * (pdsShareTopUp / 100),
            pdsYieldMonthly,
            termMonths,
            startYear,
            startMonth,
            cofinancingStartYear,
            monthlyGrowthRate,
            avgMonthlyIncome,
            usedCofinancingPerYear,
            passName: "Pass 2"
        });



        let finalNewCapitalGap = 0;
        if (capitalGap > 0) {
            finalNewCapitalGap = Math.max(0, capitalGap - (secondPass.stateCapital + secondPass.taxCapital));
        }

        return {
            recommendedReplenishment: Math.round(recommendedReplenishment * 100) / 100,
            cofinancing_next_year: secondPass.cofinancingNextYear,
            total_cofinancing_nominal: Math.round(secondPass.totalCofinNominal * 100) / 100,
            total_cofinancing_with_investment: Math.round(secondPass.stateCapital * 100) / 100,
            yearly_breakdown: secondPass.yearlyData,
            pds_applied: true,
            pds_yield_annual_percent: Math.round(pdsYieldAnnual * 100) / 100,
            new_capital_gap: Math.round(finalNewCapitalGap * 100) / 100,
            actualUsedCofinancingPerYear: secondPass.actualUsedInYear, // Возвращаем, сколько реально задействовали в этой цели
            total_tax_deductions_nominal: Math.round(secondPass.totalTaxRefundNominal * 100) / 100,
            total_tax_deductions_with_investment: Math.round(secondPass.taxCapital * 100) / 100
        };
    }

    /**
     * Вспомогательный метод для запуска симуляции накопления ПДС
     * @private
     */
    async _runSimulation(config) {
        const {
            pdsInitialCapital,
            monthlyPdsReplenishment,
            pdsYieldMonthly,
            termMonths,
            startYear,
            startMonth,
            cofinancingStartYear,
            monthlyGrowthRate,
            avgMonthlyIncome,
            usedCofinancingPerYear = {},
            passName = "Default"
        } = config;

        // Dynamic require to avoid circular deps if any, and scope it
        const TaxService = require('./TaxService');

        let clientCapital = pdsInitialCapital;
        let stateCapital = 0;
        let taxCapital = 0; // Accumulated tax refunds with investment
        let totalCofinNominal = 0;
        let totalTaxRefundNominal = 0;
        const actualUsedInYear = {}; // Сколько бонуса ПДС привязали к этой конкретной цели по годам

        const yearlyContributions = {};
        if (pdsInitialCapital > 0) {
            yearlyContributions[startYear] = (yearlyContributions[startYear] || 0) + pdsInitialCapital;
        }

        const yearlyData = [];
        let firstContributionDate = new Date(startYear, startMonth - 1, 1);
        if (startMonth === 12) {
            firstContributionDate.setFullYear(startYear + 1, 0, 1);
        } else {
            firstContributionDate.setMonth(startMonth);
        }

        let currentDate = new Date(firstContributionDate);
        let monthIndex = 0;
        let currentYear = currentDate.getFullYear();

        let capitalAtYearStart = clientCapital + stateCapital;
        let clientContribThisYear = 0;
        let cofinPaidThisYear = 0;
        let taxRefundThisYear = 0; // New: refunds received in this year

        while (monthIndex < termMonths) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;

            // --- YEAR SHIFT REPORTING ---
            if (year > currentYear && monthIndex > 0) {
                const capitalAtYearEnd = clientCapital + stateCapital;
                const percentageIncome = capitalAtYearEnd - capitalAtYearStart - clientContribThisYear - cofinPaidThisYear - taxRefundThisYear;

                // 1. Calculate Cofinancing earned for previous year (for report)
                let cofinForPrevYear = 0;
                if (yearlyContributions[currentYear] && currentYear - cofinancingStartYear < MAX_COFINANCING_YEARS) {
                    try {
                        const alreadyTaken = usedCofinancingPerYear[currentYear] || 0;
                        const remainingLimit = Math.max(0, BASE_ANNUAL_LIMIT - alreadyTaken);

                        const cofinResult = await settingsService.calculatePdsCofinancing(
                            yearlyContributions[currentYear],
                            avgMonthlyIncome,
                            remainingLimit
                        );
                        cofinForPrevYear = cofinResult.state_cofin_amount || 0;
                    } catch (e) {
                        console.error(`[PDS Debug] Error in year ${currentYear}:`, e);
                    }
                }

                // 2. Calculate Projected Tax Refund for THIS year's contribution (to be received next year)
                // This is for the UI "Potential Benefit" or ROI calculation
                let projectedTaxRefund = 0;
                try {
                    const estimatedAnnualIncome = avgMonthlyIncome * 12;
                    const taxCalc = await TaxService.calculateNdfl(estimatedAnnualIncome, currentYear);
                    // Use effective rate for deduction approximation
                    const taxProfile = {
                        annual_income_taxable: estimatedAnnualIncome,
                        ndfl_amount_without_deductions: taxCalc.taxAmount,
                        ndfl_rate_value: 0.13 // Simplified, ideally strictly from profile
                    };
                    const dedRes = await TaxService.calculatePdsDeduction(taxProfile, yearlyContributions[currentYear] || 0, currentYear);
                    projectedTaxRefund = dedRes.refundAmount;
                } catch (e) { }

                yearlyData.push({
                    year: currentYear,
                    capital_start_of_year: Math.round(capitalAtYearStart * 100) / 100,
                    client_contrib_year: Math.round(clientContribThisYear * 100) / 100,
                    cofinancing_earned: cofinForPrevYear,
                    cofinancing_paid_in_year: Math.round(cofinPaidThisYear * 100) / 100,
                    tax_refund_received: Math.round(taxRefundThisYear * 100) / 100,
                    tax_refund_projected: Math.round(projectedTaxRefund * 100) / 100,
                    capital_end_of_year: Math.round(capitalAtYearEnd * 100) / 100,
                    percentage_income: Math.round(percentageIncome * 100) / 100,
                    // ROI includes Cofinancing + Tax Refund
                    roi_immediate: clientContribThisYear > 0
                        ? Math.round(((cofinForPrevYear + projectedTaxRefund) / clientContribThisYear) * 100)
                        : 0
                });

                capitalAtYearStart = clientCapital + stateCapital;
                clientContribThisYear = 0;
                cofinPaidThisYear = 0;
                taxRefundThisYear = 0;
                currentYear = year;
            }

            // --- GROWTH ---
            clientCapital = clientCapital * (1 + pdsYieldMonthly);
            stateCapital = stateCapital * (1 + pdsYieldMonthly);
            taxCapital = taxCapital * (1 + pdsYieldMonthly); // Tax refunds also grow

            if (monthIndex < termMonths - 1) {
                const monthlyContribution = monthlyPdsReplenishment * Math.pow(1 + monthlyGrowthRate, monthIndex);
                clientCapital += monthlyContribution;
                yearlyContributions[year] = (yearlyContributions[year] || 0) + monthlyContribution;
                clientContribThisYear += monthlyContribution;
            }

            // --- EVENT: TAX REFUND (April) ---
            if (month === 4 && year > startYear) {
                const prevYear = year - 1;
                if (yearlyContributions[prevYear] > 0) {
                    try {
                        const estimatedAnnualIncome = avgMonthlyIncome * 12;
                        const taxCalc = await TaxService.calculateNdfl(estimatedAnnualIncome, prevYear);
                        const taxProfile = {
                            annual_income_taxable: estimatedAnnualIncome,
                            ndfl_amount_without_deductions: taxCalc.taxAmount,
                            ndfl_rate_value: 0.13 // Simplified
                        };
                        const dedRes = await TaxService.calculatePdsDeduction(taxProfile, yearlyContributions[prevYear], prevYear);

                        const refund = dedRes.refundAmount;
                        if (refund > 0) {
                            // Reinvest into Client Capital
                            clientCapital += refund;
                            // Track for reporting
                            taxCapital += refund;
                            totalTaxRefundNominal += refund;
                            taxRefundThisYear += refund;
                        }
                    } catch (e) {
                        console.warn('[PDS Tax] Error calculating refund', e);
                    }
                }
            }

            // --- EVENT: COFINANCING (August) ---
            if (month === COFINANCING_MONTH && year > cofinancingStartYear) {
                const prevYear = year - 1;
                if (year - cofinancingStartYear <= MAX_COFINANCING_YEARS && yearlyContributions[prevYear]) {
                    try {
                        const alreadyTaken = usedCofinancingPerYear[prevYear] || 0;
                        const remainingLimit = Math.max(0, BASE_ANNUAL_LIMIT - alreadyTaken);

                        const cofinResult = await settingsService.calculatePdsCofinancing(
                            yearlyContributions[prevYear],
                            avgMonthlyIncome,
                            remainingLimit
                        );
                        const stateCofinAmount = cofinResult.state_cofin_amount || 0;
                        if (stateCofinAmount > 0) {
                            stateCapital += stateCofinAmount;
                            totalCofinNominal += stateCofinAmount;
                            cofinPaidThisYear += stateCofinAmount;
                            actualUsedInYear[prevYear] = (actualUsedInYear[prevYear] || 0) + stateCofinAmount;
                        }
                    } catch (e) { }
                }
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
            monthIndex++;
        }

        // --- FINAL REPORT (Last Year) ---
        const capitalAtYearEnd = clientCapital + stateCapital;
        const percentageIncome = capitalAtYearEnd - capitalAtYearStart - clientContribThisYear - cofinPaidThisYear - taxRefundThisYear;
        let cofinForThisYear = 0;
        let projectedTaxRefund = 0;

        if (yearlyContributions[currentYear] && currentYear - cofinancingStartYear < MAX_COFINANCING_YEARS) {
            try {
                const alreadyTaken = usedCofinancingPerYear[currentYear] || 0;
                const remainingLimit = Math.max(0, BASE_ANNUAL_LIMIT - alreadyTaken);
                const cofinResult = await settingsService.calculatePdsCofinancing(
                    yearlyContributions[currentYear],
                    avgMonthlyIncome,
                    remainingLimit
                );
                cofinForThisYear = cofinResult.state_cofin_amount || 0;
            } catch (e) { }
        }

        // Last year tax proj
        try {
            const estimatedAnnualIncome = avgMonthlyIncome * 12;
            const taxCalc = await TaxService.calculateNdfl(estimatedAnnualIncome, currentYear);
            const taxProfile = {
                annual_income_taxable: estimatedAnnualIncome,
                ndfl_amount_without_deductions: taxCalc.taxAmount,
                ndfl_rate_value: 0.13
            };
            const dedRes = await TaxService.calculatePdsDeduction(taxProfile, yearlyContributions[currentYear] || 0, currentYear);
            projectedTaxRefund = dedRes.refundAmount;
        } catch (e) { }

        yearlyData.push({
            year: currentYear,
            capital_start_of_year: Math.round(capitalAtYearStart * 100) / 100,
            client_contrib_year: Math.round(clientContribThisYear * 100) / 100,
            cofinancing_earned: cofinForThisYear,
            cofinancing_paid_in_year: Math.round(cofinPaidThisYear * 100) / 100,
            tax_refund_received: Math.round(taxRefundThisYear * 100) / 100,
            tax_refund_projected: Math.round(projectedTaxRefund * 100) / 100,
            capital_end_of_year: Math.round(capitalAtYearEnd * 100) / 100,
            percentage_income: Math.round(percentageIncome * 100) / 100,
            roi_immediate: clientContribThisYear > 0
                ? Math.round(((cofinForThisYear + projectedTaxRefund) / clientContribThisYear) * 100)
                : 0
        });

        // Прогноз на след. год (август будущего года)
        let cofinancingNextYear = 0;
        if (yearlyContributions[startYear]) {
            try {
                // ... same logic as before ...
                // Just reusing original variable setup
                const alreadyTaken = usedCofinancingPerYear[startYear] || 0;
                const remainingLimit = Math.max(0, BASE_ANNUAL_LIMIT - alreadyTaken);
                const cofinResult = await settingsService.calculatePdsCofinancing(yearlyContributions[startYear], avgMonthlyIncome, remainingLimit);
                cofinancingNextYear = cofinResult.state_cofin_amount || 0;
            } catch (e) { }
        }

        return {
            stateCapital,
            totalCofinNominal,
            yearlyData,
            cofinancingNextYear,
            actualUsedInYear,
            taxCapital,
            totalTaxRefundNominal
        };
    }

    _findPdsYield(pdsProduct, capitalAmount, termMonths) {
        const yields = pdsProduct.yields || [];
        if (yields.length === 0) return null;
        const line = yields.find(l =>
            capitalAmount >= parseFloat(l.amount_from) &&
            capitalAmount <= parseFloat(l.amount_to) &&
            termMonths >= l.term_from_months &&
            termMonths <= l.term_to_months
        );
        const effectiveLine = line || yields[0];
        return effectiveLine ? parseFloat(effectiveLine.yield_percent) : null;
    }

    _recalculateReplenishment(capitalGap, termMonths, m_month_decimal, d_month_decimal) {
        let recommendedReplenishment = 0;
        if (Math.abs(m_month_decimal - d_month_decimal) < 0.0000001) {
            recommendedReplenishment = capitalGap / (termMonths * Math.pow(1 + d_month_decimal, termMonths - 1));
        } else {
            const numerator = capitalGap * (m_month_decimal - d_month_decimal);
            const term1 = 1 + d_month_decimal;
            const term2 = Math.pow(1 + m_month_decimal, termMonths - 1);
            const term3 = Math.pow(1 + d_month_decimal, termMonths - 1);
            const denominator = term1 * (term2 - term3);
            if (denominator !== 0) {
                recommendedReplenishment = numerator / denominator;
            }
        }
        return recommendedReplenishment;
    }
}

module.exports = new PdsCofinancingService();
