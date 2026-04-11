const TaxService = require('../algorithms/TaxService');

class TaxPlanningService {
    constructor() {
        this.limits = {
            propertyBase: 2000000,
            mortgageInterestBase: 3000000,
            socialBase: 150000
        };
    }

    async _calculatePersonBlock(avgMonthlyIncome, deductionBase, year, projectId) {
        const annualIncome = Math.max(0, Number(avgMonthlyIncome || 0)) * 12;
        const taxBefore = await TaxService.calculateNdfl(annualIncome, year, null, projectId);
        const taxAfter = await TaxService.calculateNdfl(Math.max(0, annualIncome - deductionBase), year, null, projectId);
        return {
            annual_income: annualIncome,
            ndfl_before: taxBefore.taxAmount,
            ndfl_after: taxAfter.taxAmount,
            potential_refund: Math.max(0, Math.round((taxBefore.taxAmount - taxAfter.taxAmount) * 100) / 100)
        };
    }

    async calculateExtendedTaxPlanning(payload, { projectId = null } = {}) {
        const nowYear = new Date().getFullYear();
        const clientIncome = Number(payload.client?.avg_monthly_income || 0);
        const spouseIncome = Number(payload.client?.spouse_avg_monthly_income || 0);
        const familyMode = payload.client?.tax_family_mode || 'single';

        const propertyBase = Math.min(Number(payload.deductions?.property_purchase_amount || 0), this.limits.propertyBase);
        const mortgageBase = Math.min(Number(payload.deductions?.mortgage_interest_amount || 0), this.limits.mortgageInterestBase);
        const socialBase = Math.min(Number(payload.deductions?.social_expenses_amount || 0), this.limits.socialBase);
        const children = payload.client?.tax_children || [];
        const childBase = TaxService.calculateChildrenDeductionBase(children, clientIncome * 12);

        const personMain = await this._calculatePersonBlock(
            clientIncome,
            propertyBase + mortgageBase + socialBase + childBase,
            nowYear,
            projectId
        );

        let spouse = null;
        if (familyMode !== 'single' && spouseIncome > 0) {
            const spouseChildBase = familyMode === 'both_parents'
                ? TaxService.calculateChildrenDeductionBase(children, spouseIncome * 12)
                : 0;
            spouse = await this._calculatePersonBlock(
                spouseIncome,
                spouseChildBase,
                nowYear,
                projectId
            );
        }

        return {
            year: nowYear,
            deductions: {
                property: {
                    declared_base: Number(payload.deductions?.property_purchase_amount || 0),
                    accepted_base: propertyBase,
                    base_limit: this.limits.propertyBase
                },
                mortgage_interest: {
                    declared_base: Number(payload.deductions?.mortgage_interest_amount || 0),
                    accepted_base: mortgageBase,
                    base_limit: this.limits.mortgageInterestBase
                },
                social: {
                    declared_base: Number(payload.deductions?.social_expenses_amount || 0),
                    accepted_base: socialBase,
                    base_limit: this.limits.socialBase
                },
                children: {
                    accepted_base: childBase,
                    children_count: Array.isArray(children) ? children.length : 0,
                    mode: familyMode
                }
            },
            person: personMain,
            spouse,
            totals: {
                potential_refund_family: Math.round((personMain.potential_refund + (spouse?.potential_refund || 0)) * 100) / 100
            }
        };
    }
}

module.exports = new TaxPlanningService();
