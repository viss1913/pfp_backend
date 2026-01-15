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

        // 2. Determine how much to deduct from Capital NOW
        // If Payment Variant is 0 (Single), we deduct the FULL Premium.
        // If Monthly (12), we deduct the FIRST MONTH Premium.
        const isSinglePremium = (goal.payment_variant === 0);

        let costNow = 0;
        let monthlyReplenishment = 0;
        let termYears = Math.ceil(termMonths / 12); // Default term in years

        if (nsjResult) {
            const totalPremium = nsjResult.total_premium || targetAmount;
            termYears = nsjResult.term_years || Math.ceil(termMonths / 12); // Update from NSJ if available
            const totalMonths = termYears * 12;

            if (isSinglePremium) {
                costNow = totalPremium;
                monthlyReplenishment = 0;
            } else {
                // Monthly premium estimate
                monthlyReplenishment = Math.round(totalPremium / totalMonths);
                costNow = monthlyReplenishment; // First installment
            }
        }

        // 3. Calculate Tax Deduction for Life Insurance
        const annualPremium = isSinglePremium
            ? totalPremium
            : (nsjResult.total_premium_rur || nsjResult.total_premium || 0) * 12;

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

        // 5. Construct Result
        const result = {
            goal_id: goal.goal_type_id,
            goal_name: goal.name,
            goal_type: 'LIFE',
            summary: {
                goal_type: 'LIFE',
                status: 'OK',
                initial_capital: Math.round(deductedCapital), // Shows what we paid NOW
                monthly_replenishment: Math.round(monthlyReplenishment),
                total_capital_at_end: Math.round(nsjResult.total_limit || targetAmount),
                target_achieved: true,
                state_benefit: Math.round(totalTaxDeductions * 100) / 100 // Total tax deductions over all years
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
                portfolio: {
                    name: 'Life Insurance Contract',
                    instruments: [
                        {
                            name: `NSJ Program: ${nsjResult.program || 'Standard'}`,
                            share: 100,
                            yield: 0, // Yield is implicit in the target amount/limit
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
