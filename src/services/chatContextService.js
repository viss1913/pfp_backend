function toIntRub(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // round half up to RUB
    return Math.round(n);
}

function toRateDecimalFromPercent(value) {
    // supports either 6 (percent) or 0.06 (decimal) heuristically
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n > 1) return n / 100;
    return n;
}

function isoDateToday() {
    return new Date().toISOString();
}

function monthFromDateString(dateStr) {
    const s = String(dateStr || '');
    // expects YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
    // allow YYYY-MM
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    return null;
}

function safeParseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function pickScheduleHighlights(monthlySchedule, { maxPoints = 7 } = {}) {
    if (!Array.isArray(monthlySchedule) || monthlySchedule.length === 0) return null;

    const total = monthlySchedule.length;
    const idxSet = new Set([0, total - 1]);

    const fractions = [0.25, 0.5, 0.75];
    fractions.forEach(f => idxSet.add(Math.min(total - 1, Math.max(0, Math.round((total - 1) * f)))));

    // event months: any non-zero tax_deduction or cofinancing
    for (let i = 0; i < total; i++) {
        const row = monthlySchedule[i] || {};
        const tax = Number(row.tax_deduction || 0);
        const cof = Number(row.cofinancing || 0);
        if ((Number.isFinite(tax) && tax > 0) || (Number.isFinite(cof) && cof > 0)) {
            idxSet.add(i);
        }
    }

    const indices = Array.from(idxSet).sort((a, b) => a - b);
    const trimmed = indices.length > maxPoints
        ? (() => {
            // keep start/end + up to (maxPoints-2) middle points spread evenly
            const keep = new Set([indices[0], indices[indices.length - 1]]);
            const slots = Math.max(0, maxPoints - 2);
            for (let s = 1; s <= slots; s++) {
                const pos = Math.round((indices.length - 1) * (s / (slots + 1)));
                keep.add(indices[pos]);
            }
            return indices.filter(i => keep.has(i));
        })()
        : indices;

    return trimmed.map(i => {
        const row = monthlySchedule[i] || {};
        return {
            month: monthFromDateString(row.date),
            replenishment_rub: toIntRub(row.replenishment),
            total_capital_rub: toIntRub(row.total_capital),
            tax_deduction_rub: toIntRub(row.tax_deduction),
            cofinancing_rub: toIntRub(row.cofinancing),
        };
    }).filter(p => p.month);
}

function buildMissingFields({ client, calcSummary }) {
    const missing = [];

    const income = Number(client?.monthly_income ?? client?.income_monthly ?? null);
    const expenses = Number(client?.monthly_expenses ?? client?.expenses_monthly ?? null);

    if (!Number.isFinite(income) || income <= 0) {
        missing.push({
            field: 'client.monthly_income',
            impact: 'HIGH',
            reason_ru: 'Нужно проверить, комфортен ли взнос и насколько план реалистичен.',
            question_ru: 'Сколько в среднем получаешь в месяц после налогов?'
        });
    }
    if (!Number.isFinite(expenses) || expenses < 0) {
        missing.push({
            field: 'client.monthly_expenses',
            impact: 'HIGH',
            reason_ru: 'Чтобы оценить свободный остаток и не предложить взнос, который будет душить.',
            question_ru: 'А сколько у тебя в среднем расходов в месяц?'
        });
    }

    const goalsCount = Number(calcSummary?.summary?.goals_count ?? calcSummary?.summary?.goalsCount ?? null);
    if (!Number.isFinite(goalsCount) || goalsCount <= 0) {
        missing.push({
            field: 'goals',
            impact: 'HIGH',
            reason_ru: 'Без целей не получится собрать нормальный финансовый план.',
            question_ru: 'Какую цель считаем первой? (пенсия / резерв / покупка / другое)'
        });
    }

    return missing;
}

function buildQuestionsQueue(missingFields, { maxQuestions = 3 } = {}) {
    const impactRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const sorted = [...(missingFields || [])].sort((a, b) => (impactRank[b.impact] || 0) - (impactRank[a.impact] || 0));
    return sorted.slice(0, maxQuestions).map((m, idx) => ({
        id: `q${idx + 1}`,
        field: m.field,
        impact: m.impact,
        text_ru: m.question_ru
    }));
}

function buildGoalsSummary(calcJson) {
    const goals = Array.isArray(calcJson?.goals) ? calcJson.goals : [];
    return goals.map((g, i) => {
        const s = g?.summary || {};
        const details = g?.details || {};
        const statePension = details?.state_pension || {};

        const goalId = String(g.goal_id ?? g.id ?? i + 1);
        const goalType = String(g.goal_type ?? g.goal_type_id ?? 'UNKNOWN');

        const status = String(s.status || 'UNKNOWN');
        const targetFuture = toIntRub(s.target_amount_future);
        const projectedFuture = toIntRub(s.projected_pension_monthly_future ?? s.target_amount_future);

        const inflationRate = toRateDecimalFromPercent(s.inflation_rate);
        const accumulationYield = toRateDecimalFromPercent(s.accumulation_yield_percent);

        const retirementYear = Number(statePension.retirement_year);
        const yearsToPension = Number(statePension.years_to_pension);

        return {
            goal_id: goalId,
            goal_name: String(g.goal_name || g.name || 'Цель'),
            goal_type: goalType,
            status,
            target_amount_future_rub: targetFuture,
            projected_amount_future_rub: projectedFuture,
            pension_gap_future_rub: toIntRub(s.pension_gap_future),
            projected_capital_at_retirement_rub: toIntRub(s.projected_capital_at_retirement),
            required_capital_at_retirement_rub: toIntRub(s.required_capital_at_retirement),
            years_to_pension: Number.isFinite(yearsToPension) ? Math.round(yearsToPension) : null,
            retirement_year: Number.isFinite(retirementYear) ? retirementYear : null,
            inflation_rate: inflationRate,
            accumulation_yield_rate: accumulationYield,
            monthly_replenishment_rub: toIntRub(s.monthly_replenishment),
            initial_capital_rub: toIntRub(s.initial_capital),
            tax_benefits_total_rub: toIntRub(s.total_tax_benefit),
            cofinancing_total_rub: toIntRub(s.total_cofinancing),
            risk_profile: g.risk_profile || null,
        };
    });
}

function buildTaxBenefitsMinimal(calcJson) {
    const tax = calcJson?.summary?.tax_benefits_summary || calcJson?.summary?.taxBenefitsSummary;
    if (!tax) return null;
    const totals = tax.totals || {};
    const pds = tax.pds_benefits || {};
    const nsj = tax.nsj_benefits || {};
    return {
        totals: {
            deduction_2026_rub: toIntRub(totals.deduction_2026),
            cofinancing_2026_rub: toIntRub(totals.cofinancing_2026),
            total_deductions_rub: toIntRub(totals.total_deductions),
            total_cofinancing_rub: toIntRub(totals.total_cofinancing),
            total_state_benefits_rub: toIntRub(totals.total_state_benefits),
        },
        pds: {
            deduction_2026_rub: toIntRub(pds.deduction_2026),
            cofinancing_2026_rub: toIntRub(pds.cofinancing_2026),
            total_deductions_rub: toIntRub(pds.total_deductions),
            total_cofinancing_rub: toIntRub(pds.total_cofinancing),
        },
        nsj: {
            annual_premium_rub: toIntRub(nsj.annual_premium),
            deduction_2026_rub: toIntRub(nsj.deduction_2026),
            total_deductions_rub: toIntRub(nsj.total_deductions),
        }
    };
}

function buildPortfolioMinimal(calcJson) {
    const portfolio = calcJson?.summary?.consolidated_portfolio;
    if (!portfolio) return null;

    const assetsAllocation = Array.isArray(portfolio.assets_allocation) ? portfolio.assets_allocation : [];
    const cashFlowAllocation = Array.isArray(portfolio.cash_flow_allocation) ? portfolio.cash_flow_allocation : [];

    return {
        total_initial_capital_rub: toIntRub(portfolio.total_initial_capital),
        total_monthly_replenishment_rub: toIntRub(portfolio.total_monthly_replenishment),
        assets_allocation: assetsAllocation.map(a => ({
            name: String(a.name || ''),
            amount_rub: toIntRub(a.amount),
            share_percent: Number(a.share ?? null),
            yield_percent: Number(a.yield ?? null),
            short_term_yield_percent: Number(a.short_term_yield ?? null),
        })).filter(a => a.name),
        cash_flow_allocation: cashFlowAllocation.map(a => ({
            name: String(a.name || ''),
            amount_rub: toIntRub(a.amount),
            share_percent: Number(a.share ?? null),
            yield_percent: Number(a.yield ?? null),
            short_term_yield_percent: Number(a.short_term_yield ?? null),
            payment_frequency: a.payment_frequency || null
        })).filter(a => a.name),
    };
}

function buildTimelineHighlights(calcJson) {
    const goals = Array.isArray(calcJson?.goals) ? calcJson.goals : [];
    const firstSchedule = goals.find(g => Array.isArray(g?.details?.monthly_schedule))?.details?.monthly_schedule;
    const highlights = pickScheduleHighlights(firstSchedule, { maxPoints: 7 });
    if (!highlights) return null;
    return {
        start_month: highlights[0]?.month || null,
        end_month: highlights[highlights.length - 1]?.month || null,
        points: highlights.map(p => ({
            month: p.month,
            total_capital_rub: p.total_capital_rub,
            replenishment_rub: p.replenishment_rub,
            tax_deduction_rub: p.tax_deduction_rub,
            cofinancing_rub: p.cofinancing_rub
        }))
    };
}

/**
 * buildChatContext
 *
 * Contract (v1.0):
 * - currency: RUB
 * - money values: integer RUB (rounded half up)
 * - rates: decimal fractions (0.06 = 6%)
 * - dates: ISO (YYYY-MM or YYYY-MM-DD), timeline uses YYYY-MM
 * - size target: < 20KB, so schedules are summarized into highlights
 */
function buildChatContext({ clientData, calcJson, projectId }) {
    const client = clientData?.client || {};
    const parsedCalc = safeParseJson(calcJson) || safeParseJson(client?.goals_summary) || null;

    const goalsSummary = parsedCalc ? buildGoalsSummary(parsedCalc) : [];
    const taxBenefits = parsedCalc ? buildTaxBenefitsMinimal(parsedCalc) : null;
    const portfolio = parsedCalc ? buildPortfolioMinimal(parsedCalc) : null;
    const timeline = parsedCalc ? buildTimelineHighlights(parsedCalc) : null;

    const missingFields = buildMissingFields({ client, calcSummary: parsedCalc });

    return {
        schema_version: '1.0',
        generated_at: isoDateToday(),
        project_id: projectId ?? null,
        currency: 'RUB',
        rounding: {
            money: 'RUB_0',
            rate: 'DECIMAL',
            percent_display: 'PCT_1'
        },
        client_summary: {
            client_id: client?.id ?? null,
            first_name: client?.first_name ?? null,
            age_years: client?.age ?? null,
            monthly_income_rub: toIntRub(client?.monthly_income),
            monthly_expenses_rub: toIntRub(client?.monthly_expenses),
            risk_profile: client?.risk_profile ?? null,
        },
        summary: parsedCalc?.summary ? {
            goals_count: Number(parsedCalc.summary.goals_count ?? parsedCalc.summary.goalsCount ?? null),
            total_capital_rub: toIntRub(parsedCalc.summary.total_capital),
            total_state_benefit_rub: toIntRub(parsedCalc.summary.total_state_benefit),
            investment_expense_growth_annual_rate: toRateDecimalFromPercent(parsedCalc.summary.investment_expense_growth_annual_percent),
        } : null,
        goals_summary: goalsSummary,
        portfolio_allocation_minimal: portfolio,
        tax_benefits_minimal: taxBenefits,
        timeline_highlights: timeline,
        guardrails: {
            strict_mode: true,
            no_guessing: true,
            data_sources: [
                { key: 'calc_json', priority: 1 },
                { key: 'client.goals_summary', priority: 2 },
                { key: 'client_profile_db', priority: 3 }
            ],
        },
        missing_fields: missingFields,
        questions_queue: buildQuestionsQueue(missingFields, { maxQuestions: 3 }),
    };
}

function formatChatContextForPrompt(chatContext) {
    const json = JSON.stringify(chatContext, null, 2);
    // hard guard: keep prompt sane
    const maxChars = 20000;
    if (json.length <= maxChars) return json;
    return json.slice(0, maxChars) + '\n...TRUNCATED...\n';
}

module.exports = {
    buildChatContext,
    formatChatContextForPrompt
};

