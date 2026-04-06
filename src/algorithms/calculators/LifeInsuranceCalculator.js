const BaseCalculator = require('./BaseCalculator');

/** @param {Date} d */
function formatScheduleDate(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

/**
 * В графике: ежемесячно 0 по пополнению, раз в год — годовая премия (или единый взнос в 1-й месяц).
 */
function buildLifeMonthlySchedule({
    termMonths,
    startDate,
    expectedCashValue,
    isSinglePremium,
    singlePremiumAmount,
    annualPremiumAmount
}) {
    const schedule = [];
    let currentDate = new Date(startDate);
    currentDate.setMonth(currentDate.getMonth() + 1);
    for (let m = 1; m <= termMonths; m++) {
        let replenishment = 0;
        if (isSinglePremium) {
            if (m === 1) replenishment = singlePremiumAmount;
        } else if (m % 12 === 0 || (m === termMonths && termMonths % 12 !== 0)) {
            replenishment = annualPremiumAmount;
        }
        schedule.push({
            date: formatScheduleDate(currentDate),
            replenishment: Math.round(replenishment * 100) / 100,
            total_capital: Math.round(expectedCashValue * 100) / 100,
            tax_deduction: 0,
            cofinancing: 0
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    return schedule;
}

class LifeInsuranceCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { client, services, assets, settings } = context;
        const { nsjApiService } = services;

        // 1. Calculate NSJ Parameters first (we need the premium amount)
        const termMonths = Number(goal.term_months || 120);
        const targetAmount = Number(goal.target_amount || 0);

        let nsjResult;
        let apiError = null;

        const nsjParams = {
            target_amount: targetAmount,
            term_months: termMonths,
            client: client || {},
            payment_variant: goal.payment_variant || 12, // Default monthly
            program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test'
        };

        try {
            nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
        } catch (err) {
            console.warn('NSJ API Error, using fallback:', err.message);
            apiError = err;
            // Заглушка: считаем сами по формулам, пока партнёр не работает
            const termY = Math.ceil(termMonths / 12);
            const fallbackAnnualPremium = termMonths > 0 ? (targetAmount * 12) / termMonths : targetAmount;
            nsjResult = {
                success: true,
                _fallback: true,
                total_premium: fallbackAnnualPremium,
                term_years: termY,
                total_limit: targetAmount
            };
        }

        // 2. Determine payment frequency and premium distribution
        // Logic: FIRST premium goes to initial_capital (costNow)
        // Subsequent premiums go to replenishment with payment_frequency indicator

        const isSinglePremium = (goal.payment_variant === 0);
        const isMonthlyPayment = (goal.payment_variant === 1 || goal.payment_variant === 12); // 12 может означать ежемесячный
        const isAnnualPayment = (goal.payment_variant === 'annual' || goal.payment_variant === 'yearly');

        let costNow = 0; // First premium (goes to initial_capital)
        let replenishmentAmount = 0; // Subsequent premiums
        let paymentFrequency = 'once'; // 'once', 'monthly', 'annual'
        let totalPremium = targetAmount;
        let termYears = Math.ceil(termMonths / 12);

        if (nsjResult) {
            totalPremium = nsjResult.total_premium || targetAmount;
            termYears = nsjResult.term_years || Math.ceil(termMonths / 12);

            if (isSinglePremium) {
                // Single payment: all premium goes to initial capital
                costNow = totalPremium;
                replenishmentAmount = 0;
                paymentFrequency = 'once';
            } else if (isAnnualPayment || goal.payment_variant === 12) {
                // Annual payment: totalPremium is annual premium
                // First year premium goes to initial capital
                costNow = totalPremium;
                // Subsequent years - same annual amount
                replenishmentAmount = totalPremium;
                paymentFrequency = 'annual';
            } else {
                // Monthly payment: totalPremium is annual, so monthly is /12
                const monthlyPremium = Math.round(totalPremium / 12);
                // First month goes to initial capital
                costNow = monthlyPremium;
                // Subsequent months
                replenishmentAmount = monthlyPremium;
                paymentFrequency = 'monthly';
            }
        }

        // 3. Calculate Tax Deduction for Life Insurance
        const annualPremium = totalPremium;

        let taxDeduction2026 = 0;
        let totalTaxDeductions = 0;

        if (client && client.avg_monthly_income && annualPremium > 0) {
            try {
                const annualIncome = client.avg_monthly_income * 12;
                const taxCalc = await context.services.TaxService.calculateNdfl(annualIncome, 2026, context.cachedData.taxBrackets);

                const clientProfile = {
                    annual_income_taxable: annualIncome,
                    ndfl_rate_value: taxCalc.effectiveRate
                };

                const deduction = await context.services.TaxService.calculateLifeInsuranceDeduction(
                    clientProfile,
                    annualPremium,
                    2026
                );

                taxDeduction2026 = deduction.refundAmount;
                totalTaxDeductions = taxDeduction2026 * termYears;
            } catch (err) {
                console.warn('[LifeInsuranceCalculator] Tax deduction calculation failed:', err.message);
            }
        }

        // 4. Resolve Initial Capital (respects reservation)
        // For Life, costNow is the target for deduction if no smart allocation
        const deductedCapital = this.resolveInitialCapital({ ...goal, initial_capital: costNow }, context);

        // 5. Construct Result with Payment Frequency
        const isFallback = !!(nsjResult && nsjResult._fallback);
        const risks = (nsjResult && nsjResult.risks && Array.isArray(nsjResult.risks) && nsjResult.risks.length > 0)
            ? nsjResult.risks
            : isFallback
                ? [
                    { risk_name: 'Уход из жизни (любая причина)', limit_amount: Math.round(targetAmount) },
                    { risk_name: 'Инвалидность I-II гр.', limit_amount: Math.round(targetAmount) },
                    { risk_name: 'Критические заболевания', limit_amount: Math.round(targetAmount * 5) }
                ]
                : [
                    { risk_name: 'Уход из жизни (любая причина)', limit_amount: Math.round(targetAmount) },
                    { risk_name: 'Телесные повреждения (Травма)', limit_amount: Math.round(targetAmount * 0.5) },
                    { risk_name: 'Инвалидность I-II гр.', limit_amount: Math.round(targetAmount) }
                ];

        const fallbackInitialCapital = termMonths > 0 ? (targetAmount * 12) / termMonths : 0;
        const fallbackMonthlyReplenishment = termMonths > 0 ? targetAmount / termMonths : 0;

        const result = {
            goal_id: goal.id || goal.goal_type_id,
            goal_type_id: 5,
            goal_type: 'LIFE',
            summary: {
                status: 'OK',
                target_coverage: Math.round(targetAmount * 100) / 100,
                target_amount_initial: Math.round(targetAmount * 100) / 100,
                target_amount_future: Math.round(targetAmount * 100) / 100,

                initial_capital: Math.round((isFallback ? fallbackInitialCapital : deductedCapital) * 100) / 100,
                premium_frequency: paymentFrequency,

                target_months: termMonths,

                expected_cash_value: Math.round((nsjResult.total_limit || targetAmount) * 100) / 100,

                investment_yield_percent: 5.0, // Default or from API if available
                total_tax_benefit: Math.round(totalTaxDeductions * 100) / 100
            },
            details: {
                program_name: nsjResult.program || goal.program || (isFallback ? 'НСЖ Династия' : 'Страхование жизни'),
                annual_premium: isFallback ? Math.round(fallbackInitialCapital * 100) / 100 : annualPremium,
                tax_deduction_2026: Math.round(taxDeduction2026 * 100) / 100,
                total_tax_deductions: Math.round(totalTaxDeductions * 100) / 100,
                risks: risks
            }
        };

        if (isFallback) {
            result.summary.monthly_replenishment = Math.round(fallbackMonthlyReplenishment * 100) / 100;
            result.details.initial_instruments = [
                {
                    name: 'НСЖ Династия',
                    share: 100,
                    yield: 5,
                    amount: Math.round(fallbackInitialCapital * 100) / 100,
                    product_type: 'NSZH',
                },
            ];
            result.details.monthly_instruments = [
                {
                    name: 'НСЖ Династия',
                    share: 100,
                    yield: 5,
                    amount: Math.round(fallbackMonthlyReplenishment * 100) / 100,
                    payment_frequency: 'monthly',
                    product_type: 'NSZH',
                },
            ];
        }

        result.details.monthly_schedule = buildLifeMonthlySchedule({
            termMonths,
            startDate: goal.start_date ? new Date(goal.start_date) : new Date(),
            expectedCashValue: result.summary.expected_cash_value,
            isSinglePremium,
            singlePremiumAmount: Math.round(totalPremium * 100) / 100,
            annualPremiumAmount: result.details.annual_premium
        });

        if (apiError && !isFallback) {
            result.error = apiError.originalError ? apiError.originalError.message : apiError.message;
        }

        return result;
    }
}

module.exports = new LifeInsuranceCalculator();
