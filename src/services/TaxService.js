const knex = require('../config/database');

class TaxService {
    /**
     * Calculate NDFL (Personal Income Tax) based on progressive scale
     * @param {number} annualIncome - Annual taxable income
     * @param {number} year - Tax year
     * @returns {Promise<{taxAmount: number, effectiveRate: number, brackets: Array}>}
     */
    async calculateNdfl(annualIncome, year) {
        // 1. Try to find Year-Specific Rates (New System)
        let rates = await knex('tax_income_rates')
            .where('tax_year', year)
            .orderBy('order_index', 'asc');

        // 2. Fallback: Use "Standard/Current" Rates from Admin Panel Table (tax_2ndfl_brackets)
        // This takes whatever is configured in the admin panel as the default rule for unknown years.
        if (!rates || rates.length === 0) {
            try {
                rates = await knex('tax_2ndfl_brackets')
                    .orderBy('order_index', 'asc');
            } catch (e) {
                console.warn('TaxService: Failed to fetch from tax_2ndfl_brackets', e.message);
            }
        }

        // 3. Last Resort Fallback (Hardcoded)
        if (!rates || rates.length === 0) {
            console.warn(`TaxService: No rates found in DB (checked 'tax_income_rates' and 'tax_2ndfl_brackets'). Using default 13%.`);
            const tax = annualIncome * 0.13;
            return {
                taxAmount: tax,
                effectiveRate: 0.13,
                brackets: []
            };
        }

        let remainingIncome = annualIncome;
        let totalTax = 0;
        const usedBrackets = [];

        for (const bracket of rates) {
            if (remainingIncome <= 0) break;

            // Bracket logic: 
            // Range is [bracket.income_from, bracket.income_to]
            // "Part of income falling into this bracket":
            // max(0, min(annualIncome, bracket.income_to) - bracket.income_from)

            const incomeInBracket = Math.max(0, Math.min(annualIncome, bracket.income_to) - bracket.income_from);

            if (incomeInBracket > 0) {
                const taxForBracket = incomeInBracket * (bracket.rate / 100); // rate is in percent e.g. 13
                totalTax += taxForBracket;
                usedBrackets.push({
                    rate: bracket.rate,
                    base: incomeInBracket,
                    tax: taxForBracket
                });
            }
        }

        const effectiveRate = annualIncome > 0 ? (totalTax / annualIncome) : 0;

        return {
            taxAmount: Number(totalTax.toFixed(2)),
            effectiveRate: Number(effectiveRate.toFixed(4)),
            brackets: usedBrackets
        };
    }

    /**
     * Calculate PDS Deduction
     * @param {object} clientProfile - { annual_income_taxable, ndfl_amount_paid }
     * @param {number} pdsContributions - Total contributions to PDS/IIS
     * @param {number} year - Tax year
     * @returns {Promise<{deductionBase: number, refundAmount: number, limitApplied: number, rateUsed: number, taxPaidCap: number}>}
     */
    async calculatePdsDeduction(clientProfile, pdsContributions, year) {
        // Legacy support / Simplified
        const baseLimit = 400000;
        const deductionBase = Math.min(pdsContributions, baseLimit);
        let rateToUse = clientProfile.ndfl_rate_value || 0.13;
        const potentialRefund = deductionBase * rateToUse;
        const taxPaid = clientProfile.ndfl_amount_without_deductions || 0;
        const realRefund = Math.min(potentialRefund, taxPaid);

        return {
            deductionBase: deductionBase,
            refundAmount: Number(realRefund.toFixed(2)),
            rateUsed: rateToUse,
            taxPaidCap: taxPaid
        };
    }

    /**
     * Calculate PDS Refund using Delta Method (Before vs After)
     * This is the most accurate way for progressive rates (13/15%)
     */
    async calculatePdsRefundDelta(annualIncome, newContribution, totalPreviousContributions = 0, year) {
        const baseLimit = 400000;

        // Суммарный лимит базы
        const currentTotal = totalPreviousContributions;
        const newTotal = Math.min(currentTotal + newContribution, baseLimit);

        // Фактически учитываемый новый взнос (с учетом лимита 400к)
        const effectiveNewContribution = Math.max(0, newTotal - currentTotal);

        const taxBefore = await this.calculateNdfl(Math.max(0, annualIncome - currentTotal), year);
        const taxAfter = await this.calculateNdfl(Math.max(0, annualIncome - newTotal), year);

        const refundAmount = Math.round((taxBefore.taxAmount - taxAfter.taxAmount) * 100) / 100;

        return {
            contributionAdded: effectiveNewContribution,
            refundAmount,
            taxBefore: taxBefore.taxAmount,
            taxAfter: taxAfter.taxAmount
        };
    }

    /**
     * Store calculation results in DB (optional helper)
     */
    async saveClientTaxProfile(clientId, year, profileData) {
        return knex('client_tax_profile')
            .insert({
                client_id: clientId,
                tax_year: year,
                ...profileData
            })
            .onConflict(['client_id', 'tax_year'])
            .merge();
    }
}

module.exports = new TaxService();
