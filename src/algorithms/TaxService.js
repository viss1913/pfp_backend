const knex = require('../config/database');

class TaxService {
    static LONG_TERM_SAVINGS_LIMIT = 400000;
    static CHILDREN_DEDUCTION_DEFAULTS = {
        incomeLimit: 450000,
        firstChildMonthly: 1400,
        secondChildMonthly: 2800,
        thirdPlusMonthly: 6000,
        disabledChildMonthly: 12000
    };
    /**
     * Calculate NDFL (Personal Income Tax) based on progressive scale
     * @param {number} annualIncome - Annual taxable income
     * @param {number} year - Tax year
     * @returns {Promise<{taxAmount: number, effectiveRate: number, brackets: Array}>}
     */

    async calculateNdfl(annualIncome, year, cachedTaxBrackets = null, projectId = null) {
        // 1. Try to use Cached Rates if provided
        let rates;
        if (cachedTaxBrackets && Array.isArray(cachedTaxBrackets) && cachedTaxBrackets.length > 0) {
            // Assuming cachedTaxBrackets are sorted
            rates = cachedTaxBrackets;
        } else {
            // 1b. Try to find Year-Specific Rates (New System)
            rates = await knex('tax_income_rates')
                .where('tax_year', year)
                .orderBy('order_index', 'asc');

            // 2. Fallback: Use "Standard/Current" Rates
            if (!rates || rates.length === 0) {
                try {
                    const query = knex('tax_2ndfl_brackets');
                    if (projectId) {
                        query.where(builder => {
                            builder.where('project_id', projectId).orWhereNull('project_id');
                        }).orderBy('project_id', 'desc');
                    } else {
                        query.whereNull('project_id');
                    }
                    rates = await query.orderBy('order_index', 'asc');
                } catch (e) {
                    console.warn('TaxService: Failed to fetch from tax_2ndfl_brackets', e.message);
                }
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

        let previousLimit = 0;
        for (const bracket of rates) {
            if (remainingIncome <= 0) break;

            // Ensure continuity by using the previous bracket's limit as the start of the current one
            // If it's the first bracket, start is 0.
            // DB has 2,400,001, effectively means > 2,400,000.
            const effectiveFrom = previousLimit;
            const effectiveTo = bracket.income_to;

            // "Part of income falling into this bracket":
            // max(0, min(annualIncome, effectiveTo) - effectiveFrom)
            const incomeInBracket = Math.max(0, Math.min(annualIncome, effectiveTo) - effectiveFrom);

            if (incomeInBracket > 0) {
                const taxForBracket = incomeInBracket * (bracket.rate / 100);
                totalTax += taxForBracket;
                usedBrackets.push({
                    rate: bracket.rate,
                    base: incomeInBracket,
                    tax: taxForBracket
                });
            }
            previousLimit = effectiveTo;
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
    async calculatePdsRefundDelta(annualIncome, newContribution, totalPreviousContributions = 0, year, cachedTaxBrackets = null) {
        const baseLimit = TaxService.LONG_TERM_SAVINGS_LIMIT;

        // Суммарный лимит базы
        const currentTotal = totalPreviousContributions;
        const newTotal = Math.min(currentTotal + newContribution, baseLimit);

        // Фактически учитываемый новый взнос (с учетом лимита 400к)
        const effectiveNewContribution = Math.max(0, newTotal - currentTotal);

        const taxBefore = await this.calculateNdfl(Math.max(0, annualIncome - currentTotal), year, cachedTaxBrackets);
        const taxAfter = await this.calculateNdfl(Math.max(0, annualIncome - newTotal), year, cachedTaxBrackets);

        const refundAmount = Math.round((taxBefore.taxAmount - taxAfter.taxAmount) * 100) / 100;

        return {
            contributionAdded: effectiveNewContribution,
            refundAmount,
            taxBefore: taxBefore.taxAmount,
            taxAfter: taxAfter.taxAmount
        };
    }

    async calculateLongTermSavingsRefund({
        annualIncome,
        year,
        pdsContribution = 0,
        iisContribution = 0,
        usedDeductionBase = 0,
        cachedTaxBrackets = null,
        projectId = null
    }) {
        const baseLimit = TaxService.LONG_TERM_SAVINGS_LIMIT;
        const alreadyUsed = Math.max(0, Number(usedDeductionBase || 0));
        const remainingBase = Math.max(0, baseLimit - alreadyUsed);

        const pdsBase = Math.min(Math.max(0, Number(pdsContribution || 0)), remainingBase);
        const iisBase = Math.min(Math.max(0, Number(iisContribution || 0)), Math.max(0, remainingBase - pdsBase));
        const totalAddedBase = pdsBase + iisBase;

        if (totalAddedBase <= 0) {
            return {
                pdsContributionAdded: 0,
                iisContributionAdded: 0,
                totalContributionAdded: 0,
                pdsRefund: 0,
                iisRefund: 0,
                totalRefund: 0
            };
        }

        const taxBefore = await this.calculateNdfl(
            Math.max(0, annualIncome - alreadyUsed),
            year,
            cachedTaxBrackets,
            projectId
        );

        const taxAfterPds = await this.calculateNdfl(
            Math.max(0, annualIncome - alreadyUsed - pdsBase),
            year,
            cachedTaxBrackets,
            projectId
        );
        const pdsRefund = Math.max(0, Math.round((taxBefore.taxAmount - taxAfterPds.taxAmount) * 100) / 100);

        const taxAfterAll = await this.calculateNdfl(
            Math.max(0, annualIncome - alreadyUsed - totalAddedBase),
            year,
            cachedTaxBrackets,
            projectId
        );
        const iisRefund = Math.max(0, Math.round((taxAfterPds.taxAmount - taxAfterAll.taxAmount) * 100) / 100);

        return {
            pdsContributionAdded: pdsBase,
            iisContributionAdded: iisBase,
            totalContributionAdded: totalAddedBase,
            pdsRefund,
            iisRefund,
            totalRefund: Math.round((pdsRefund + iisRefund) * 100) / 100
        };
    }

    calculateChildrenDeductionBase(children = [], annualIncome = 0, options = {}) {
        if (!Array.isArray(children) || children.length === 0) {
            return 0;
        }

        const cfg = {
            ...TaxService.CHILDREN_DEDUCTION_DEFAULTS,
            ...options
        };

        const monthlyIncome = Math.max(0, Number(annualIncome || 0) / 12);
        const monthsEligibleByIncome = monthlyIncome > 0
            ? Math.max(0, Math.min(12, Math.floor((cfg.incomeLimit - 1) / monthlyIncome)))
            : 12;

        const deducibleChildren = children.filter((child) => {
            if (!child || !child.birth_date) return false;
            const birthDate = new Date(child.birth_date);
            if (Number.isNaN(birthDate.getTime())) return false;
            const now = new Date();
            let age = now.getFullYear() - birthDate.getFullYear();
            const monthDiff = now.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
            if (age < 18) return true;
            return Boolean(child.is_full_time_student) && age <= 24;
        });

        if (deducibleChildren.length === 0 || monthsEligibleByIncome <= 0) return 0;

        const monthlyBase = deducibleChildren.reduce((sum, child, index) => {
            const ordinal = index + 1;
            let base = 0;
            if (ordinal === 1) base += cfg.firstChildMonthly;
            else if (ordinal === 2) base += cfg.secondChildMonthly;
            else base += cfg.thirdPlusMonthly;
            if (child.is_disabled) {
                base += cfg.disabledChildMonthly;
            }
            return sum + base;
        }, 0);

        return Math.max(0, monthlyBase * monthsEligibleByIncome);
    }

    async calculateChildrenRefundDelta({
        annualIncome,
        year,
        children = [],
        cachedTaxBrackets = null,
        projectId = null,
        options = {}
    }) {
        const deductionBase = this.calculateChildrenDeductionBase(children, annualIncome, options);
        if (deductionBase <= 0) {
            return { deductionBase: 0, refundAmount: 0 };
        }

        const taxBefore = await this.calculateNdfl(
            Math.max(0, annualIncome),
            year,
            cachedTaxBrackets,
            projectId
        );
        const taxAfter = await this.calculateNdfl(
            Math.max(0, annualIncome - deductionBase),
            year,
            cachedTaxBrackets,
            projectId
        );

        return {
            deductionBase: Math.round(deductionBase * 100) / 100,
            refundAmount: Math.max(0, Math.round((taxBefore.taxAmount - taxAfter.taxAmount) * 100) / 100)
        };
    }

    /**
     * Calculate Life Insurance (НСЖ) Tax Deduction
     * @param {Object} clientProfile - { annual_income_taxable, ndfl_rate_value }
     * @param {number} annualPremium - Annual life insurance premium
     * @param {number} year - Tax year
     * @returns {Promise<{deductionBase: number, refundAmount: number, limitApplied: number, rateUsed: number}>}
     */
    async calculateLifeInsuranceDeduction(clientProfile, annualPremium, year) {
        const BASE_LIMIT = 150000; // Max 150K RUB premium for deduction (per year)

        const deductionBase = Math.min(annualPremium, BASE_LIMIT);
        const rateToUse = clientProfile.ndfl_rate_value || 0.13;
        const refundAmount = deductionBase * rateToUse;

        return {
            deductionBase: deductionBase,
            refundAmount: Number(refundAmount.toFixed(2)),
            limitApplied: BASE_LIMIT,
            rateUsed: rateToUse
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
