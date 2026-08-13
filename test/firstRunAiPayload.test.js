const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFirstRunAiTrailingPayload } = require('../src/services/constructorAiService');

const sampleCalc = {
    summary: {
        goals_count: 1,
        total_state_benefit: 120000,
        tax_benefits_summary: {
            totals: { total_deductions: 52000, total_cofinancing: 68000, total_state_benefits: 120000 },
            pds_benefits: {
                total_deductions: 52000,
                total_cofinancing: 68000,
                deduction_2026: 13000,
                cofinancing_2026: 36000,
                yearly_breakdown: [{ year: 2026, amount: 99999 }],
            },
            nsj_benefits: { annual_premium: 0, deduction_2026: 0, total_deductions: 0 },
        },
    },
    goals: [
        {
            goal_id: 101,
            goal_name: 'Пенсия',
            goal_type_id: 1,
            goal_type: 'PENSION',
            summary: {
                target_amount_initial: 150000,
                state_pension_monthly_today: 45000,
                projected_capital_at_retirement: 12500000,
                monthly_replenishment: 35000,
                total_tax_benefit: 52000,
                total_cofinancing: 68000,
                _debug: { internal: true },
            },
            details: {
                state_pension: {
                    retirement_year: 2046,
                    years_to_pension: 20,
                    retirement_age: 65,
                    ipk_total: 150,
                },
                portfolio_name: 'Balanced',
            },
        },
    ],
};

test('buildFirstRunAiTrailingPayload is compact summary without glossaries', () => {
    const payload = buildFirstRunAiTrailingPayload(sampleCalc, {
        constructorClient: { nickname: 'Alex' },
        extraction: { client: { first_name: 'Александр', sex: 'male', birth_date: '1986-05-01', avg_monthly_income: 200000 } },
    });
    const json = JSON.stringify(payload);

    assert.ok(json.length < 2500, `expected <2500 chars, got ${json.length}`);
    assert.equal(payload.goals[0].summary._debug, undefined);
    assert.equal(payload.pension_field_glossary_ru, undefined);
    assert.equal(payload.plan_tax_and_state_benefits_glossary_ru, undefined);
    assert.equal(payload.goals[0].retirement_timeline.retirement_year, 2046);
    assert.equal(payload.client_for_ai.display_name, 'Александр');
    assert.ok(Array.isArray(payload.presentation_hints_ru));
});
