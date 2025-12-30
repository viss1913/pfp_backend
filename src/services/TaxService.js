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
        // 1. Get rules
        const rules = await knex('tax_deduction_rules')
            .where('deduction_type', 'PDS')
            .where('year_from', '<=', year)
            .where('year_to', '>=', year)
            .first();

        const baseLimit = rules ? rules.base_limit : 400000; // Default fallback

        // 2. Calculate Base
        // Limit base by legal limit (e.g. 400k) and actual contribution
        const deductionBase = Math.min(pdsContributions, baseLimit);

        // 3. Determine Rate
        // Use client's effective or marginal rate stored in profile.
        // Fallback to 13% if missing.
        let rateToUse = clientProfile.ndfl_rate_value || 0.13;

        // 4. Calculate Potential
        const potentialRefund = deductionBase * rateToUse;

        // 5. Cap by Tax Paid
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
