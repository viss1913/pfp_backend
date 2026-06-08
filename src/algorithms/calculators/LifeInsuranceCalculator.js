const BaseCalculator = require('./BaseCalculator');
const { fetchLifeNsjResult, deriveLifeCostNow } = require('./lifeUpfrontAmount');
const { resolveLifeTermMonths } = require('./lifeTermDefaults');
const { isSberLifeCalcProject } = require('./sberLifeProjectIds');

function resolveProjectId(context) {
    const fromContext = Number(context?.projectId);
    if (Number.isFinite(fromContext) && fromContext > 0) return fromContext;
    const fromClient = Number(context?.client?.project_id);
    if (Number.isFinite(fromClient) && fromClient > 0) return fromClient;
    return null;
}

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
    paymentFrequency,
    singlePremiumAmount,
    annualPremiumAmount,
    monthlyPremiumAmount
}) {
    const schedule = [];
    let currentDate = new Date(startDate);
    currentDate.setMonth(currentDate.getMonth() + 1);
    for (let m = 1; m <= termMonths; m++) {
        let replenishment = 0;
        if (paymentFrequency === 'once') {
            if (m === 1) replenishment = singlePremiumAmount;
        } else if (paymentFrequency === 'annual') {
            if (m % 12 === 0 || (m === termMonths && termMonths % 12 !== 0)) {
                replenishment = annualPremiumAmount;
            }
        } else if (paymentFrequency === 'monthly') {
            replenishment = monthlyPremiumAmount;
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

        // 1. Calculate NSJ Parameters first (we need the premium amount)
        const projectId = resolveProjectId(context);
        const isFinamSberLife = isSberLifeCalcProject(projectId);
        const termMonths = resolveLifeTermMonths(projectId, goal.term_months);
        const targetAmount = Number(goal.target_amount || 0);
        const goalWithTerm = { ...goal, term_months: termMonths, target_amount: targetAmount };

        let nsjResult;
        let apiError = null;
        const lifeQuote = await fetchLifeNsjResult(goalWithTerm, context);
        nsjResult = lifeQuote.nsjResult;
        apiError = lifeQuote.apiError;
        if (apiError && !isFinamSberLife) {
            console.warn('NSJ API Error, using fallback:', apiError.message);
        }

        // 2. Determine payment frequency and premium distribution
        const isSinglePremium = (goal.payment_variant === 0);
        const isAnnualPayment = (goal.payment_variant === 'annual' || goal.payment_variant === 'yearly');

        let costNow = deriveLifeCostNow(goal, nsjResult);
        let replenishmentAmount = 0;
        let paymentFrequency = 'once';
        let totalPremium = nsjResult ? (nsjResult.total_premium || targetAmount) : targetAmount;
        let termYears = nsjResult ? (nsjResult.term_years || Math.ceil(termMonths / 12)) : Math.ceil(termMonths / 12);

        const monthlyFromNsj = nsjResult && Number.isFinite(Number(nsjResult.monthly_premium))
            ? Number(nsjResult.monthly_premium)
            : null;

        if (isFinamSberLife) {
            replenishmentAmount = monthlyFromNsj != null
                ? Math.round(monthlyFromNsj * 100) / 100
                : Math.round((totalPremium / 12) * 100) / 100;
            paymentFrequency = 'monthly';
        } else if (isSinglePremium) {
            replenishmentAmount = 0;
            paymentFrequency = 'once';
        } else if (isAnnualPayment || goal.payment_variant === 12) {
            replenishmentAmount = totalPremium;
            paymentFrequency = 'annual';
        } else {
            replenishmentAmount = Math.round(totalPremium / 12);
            paymentFrequency = 'monthly';
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

        // 4. Initial capital: smart-аллокация уже списала с пула, если smart > 0; иначе — списываем первый взнос здесь
        let deductedCapital;
        const smart = goal.smart_initial_capital;
        if (smart !== undefined && smart !== null && Number(smart) > 0) {
            deductedCapital = Number(smart);
        } else {
            deductedCapital = this.deductFromSharedPool(costNow, context);
        }

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
            goal_id: goal.id || goal.goal_id,
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
                program_name: isFinamSberLife
                    ? 'Подушка безопасности · Сбер Страхование Жизни'
                    : (nsjResult.program || goal.program || (isFallback ? 'НСЖ Династия' : 'Страхование жизни')),
                ...(isFinamSberLife
                    ? {
                        company_name: 'Сбер Страхование жизни',
                        insurer_name: 'Сбер Страхование жизни',
                    }
                    : {}),
                annual_premium: isFallback ? Math.round(fallbackInitialCapital * 100) / 100 : annualPremium,
                tax_deduction_2026: Math.round(taxDeduction2026 * 100) / 100,
                total_tax_deductions: Math.round(totalTaxDeductions * 100) / 100,
                risks: risks
            }
        };

        if (isFallback || isFinamSberLife) {
            const instrumentName = isFinamSberLife
                ? 'Подушка безопасности · Сбер Страхование жизни'
                : 'НСЖ Династия';
            result.summary.monthly_replenishment = Math.round(fallbackMonthlyReplenishment * 100) / 100;
            if (isFinamSberLife) {
                result.summary.monthly_replenishment = monthlyFromNsj != null
                    ? Math.round(monthlyFromNsj * 100) / 100
                    : Math.round((annualPremium / 12) * 100) / 100;
            }
            result.details.initial_instruments = [
                {
                    name: instrumentName,
                    share: 100,
                    yield: isFinamSberLife ? 0 : 5,
                    amount: isFinamSberLife ? Math.round(annualPremium * 100) / 100 : Math.round(fallbackInitialCapital * 100) / 100,
                    product_type: 'NSZH',
                    product_id: null,
                    resolut_pfp_code: null,
                },
            ];
            result.details.monthly_instruments = [
                {
                    name: instrumentName,
                    share: 100,
                    yield: isFinamSberLife ? 0 : 5,
                    amount: isFinamSberLife
                        ? (monthlyFromNsj != null
                            ? Math.round(monthlyFromNsj * 100) / 100
                            : Math.round((annualPremium / 12) * 100) / 100)
                        : Math.round(fallbackMonthlyReplenishment * 100) / 100,
                    payment_frequency: 'monthly',
                    product_type: 'NSZH',
                    product_id: null,
                    resolut_pfp_code: null,
                },
            ];
        }

        result.details.monthly_schedule = buildLifeMonthlySchedule({
            termMonths,
            startDate: goal.start_date ? new Date(goal.start_date) : new Date(),
            expectedCashValue: result.summary.expected_cash_value,
            paymentFrequency,
            singlePremiumAmount: Math.round(totalPremium * 100) / 100,
            annualPremiumAmount: result.details.annual_premium,
            monthlyPremiumAmount: result.summary.monthly_replenishment
        });

        if (apiError && !isFallback) {
            result.error = apiError.originalError ? apiError.originalError.message : apiError.message;
        }

        return result;
    }
}

module.exports = new LifeInsuranceCalculator();
