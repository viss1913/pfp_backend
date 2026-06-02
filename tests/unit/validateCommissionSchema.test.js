const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCommissionSchema, getCommissionSchemaMeta } = require('../../src/utils/validateCommissionSchema');

test('getCommissionSchemaMeta returns stable rule metadata', () => {
    const meta = getCommissionSchemaMeta();
    assert.equal(meta.version, 1);
    assert.ok(Array.isArray(meta.rule_types));
    assert.ok(meta.rule_types.some((r) => r.code === 'ONE_TIME_FIXED'));
});

test('validateCommissionSchema returns 422-style details for invalid schema', () => {
    const result = validateCommissionSchema({
        version: 1,
        rules: [
            {
                rule_type: 'TIERED_BY_YEAR',
                base: 'FLOW',
                rate_percent: 11,
                tiers: [{ year_from: 2, year_to: 1, rate_percent: 110 }],
            },
        ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(result.details));
    assert.ok(result.details.some((d) => d.field_path.includes('tiers[0].year_to')));
    assert.ok(result.details.some((d) => d.field_path.endsWith('rate_percent')));
});

test('validateCommissionSchema normalizes valid schema', () => {
    const result = validateCommissionSchema({
        version: 1,
        rules: [
            {
                rule_type: 'one_time_percent_of_premium',
                base: 'initial',
                rate_percent: 30,
            },
        ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.normalized.rules[0].rule_type, 'ONE_TIME_PERCENT_OF_PREMIUM');
    assert.equal(result.normalized.rules[0].base, 'INITIAL');
    assert.equal(result.normalized.rules[0].frequency, 'ONE_TIME');
});

