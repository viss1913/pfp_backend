const BaseCalculator = require('./BaseCalculator');

class LifeInsuranceCalculator extends BaseCalculator {
    async calculate(goal, context) {
        const { client, services, assets, settings } = context;
        const { nsjApiService } = services;

        // 1. Calculate NSJ Parameters first (we need the premium amount)
        const termMonths = goal.term_months || 120;
        const targetAmount = goal.target_amount || 0;

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
            // Always fallback if API fails to prevent white screen
            // Create fallback result structure
            const termY = Math.ceil(termMonths / 12);
            nsjResult = {
                success: true,
                warnings: ['Calculated by Smart Engine (Fallback Mode) - API Unavailable'],
                total_premium: targetAmount, // Simplification: Premium = Target for fallback
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

        // 4. Deduct from Shared Pool (Waterfall) using the new BaseCalculator method
        // Use smart_initial_capital if allocated by CalculationService (Burden-Based), otherwise use costNow
        let amountToDeduct = (goal.smart_initial_capital !== undefined) ? goal.smart_initial_capital : costNow;
        const deductedCapital = this.deductFromSharedPool(amountToDeduct, context);

        // 5. Construct Result with Payment Frequency
        const result = {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'LIFE',
            summary: {
                goal_type: 'LIFE',
                status: 'OK',
                initial_capital: Math.round(deductedCapital), // First premium
                monthly_replenishment: paymentFrequency === 'monthly' ? Math.round(replenishmentAmount) : 0,
                total_capital_at_end: Math.round(nsjResult.total_limit || targetAmount),
                target_achieved: true,
                state_benefit: Math.round(totalTaxDeductions * 100) / 100, // Total tax deductions over all years
                payment_frequency: paymentFrequency // 'once', 'monthly', 'annual'
            },
            nsj_calculation: nsjResult,
            details: {
                term_months: termMonths,
                target_amount_initial: targetAmount,
                target_capital_required: Math.round(nsjResult.total_limit || targetAmount),
                payment_variant: goal.payment_variant,
                program: nsjResult.program,
                annual_premium: Math.round(annualPremium * 100) / 100,
                tax_deduction_2026: Math.round(taxDeduction2026 * 100) / 100,
                total_tax_deductions: Math.round(totalTaxDeductions * 100) / 100,
                payment_frequency: paymentFrequency,
                replenishment_amount: Math.round(replenishmentAmount * 100) / 100,

                // Portfolio instruments for consolidated portfolio
                initial_capital_instruments: [
                    {
                        name: `НСЖ: ${nsjResult.program || 'Standard'} (Первый взнос)`,
                        share: 100,
                        yield: 0,
                        amount: Math.round(deductedCapital)
                    }
                ],

                // Replenishment instruments (if not single payment)
                monthly_savings_instruments: paymentFrequency !== 'once' ? [
                    {
                        name: `НСЖ: ${nsjResult.program || 'Standard'} (Пополнения)`,
                        share: 100,
                        yield: 0,
                        amount: Math.round(replenishmentAmount * 100) / 100,
                        payment_frequency: paymentFrequency // 'monthly' or 'annual'
                    }
                ] : [],

                // Legacy portfolio field for backward compatibility
                portfolio: {
                    name: 'Life Insurance Contract',
                    instruments: [
                        {
                            name: `NSJ Program: ${nsjResult.program || 'Standard'}`,
                            share: 100,
                            yield: 0,
                            amount: Math.round(deductedCapital)
                        }
                    ]
                }
            }
        };

        if (apiError) {
            result.error = apiError.originalError ? apiError.originalError.message : apiError.message;
        }

        return result;
    }
}

module.exports = new LifeInsuranceCalculator();
