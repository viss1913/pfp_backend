'use strict';

const ALLOWED_RULE_TYPES = new Set([
    'ONE_TIME_FIXED',
    'ONE_TIME_PERCENT_OF_PREMIUM',
    'FIRST_YEAR_PERCENT_OF_PREMIUMS',
    'ANNUAL_PERCENT_OF_PREMIUM',
    'AUM_MANAGEMENT_FEE',
    'TIERED_BY_YEAR',
]);

const ALLOWED_BASES = new Set([
    'INITIAL',
    'FLOW',
    'INITIAL_PLUS_FLOW',
    'AUM_AVG',
]);

const ALLOWED_FREQUENCIES = new Set([
    'ONE_TIME',
    'MONTHLY',
    'YEARLY',
]);

function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

function isNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function asObject(input) {
    if (input == null || input === '') return null;
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    return typeof input === 'object' ? input : null;
}

function normalizeRule(rule) {
    const out = { ...rule };
    if (typeof out.rule_type === 'string') out.rule_type = out.rule_type.trim().toUpperCase();
    if (typeof out.base === 'string') out.base = out.base.trim().toUpperCase();
    if (typeof out.frequency === 'string') out.frequency = out.frequency.trim().toUpperCase();
    return out;
}

function validateCommissionSchema(raw) {
    const schema = asObject(raw);
    if (schema == null) {
        return { ok: true, normalized: null };
    }

    const version = Number(schema.version == null ? 1 : schema.version);
    if (!Number.isInteger(version) || version <= 0) {
        return { ok: false, error: 'commission_schema.version must be a positive integer' };
    }

    if (!Array.isArray(schema.rules)) {
        return { ok: false, error: 'commission_schema.rules must be an array' };
    }

    const normalizedRules = [];
    for (let i = 0; i < schema.rules.length; i += 1) {
        const sourceRule = schema.rules[i];
        if (!sourceRule || typeof sourceRule !== 'object' || Array.isArray(sourceRule)) {
            return { ok: false, error: `commission_schema.rules[${i}] must be an object` };
        }
        const rule = normalizeRule(sourceRule);
        if (!ALLOWED_RULE_TYPES.has(rule.rule_type)) {
            return { ok: false, error: `commission_schema.rules[${i}].rule_type is invalid` };
        }

        if (rule.base != null && !ALLOWED_BASES.has(rule.base)) {
            return { ok: false, error: `commission_schema.rules[${i}].base is invalid` };
        }
        if (rule.frequency != null && !ALLOWED_FREQUENCIES.has(rule.frequency)) {
            return { ok: false, error: `commission_schema.rules[${i}].frequency is invalid` };
        }
        if (rule.rate_percent != null && !isNonNegativeNumber(Number(rule.rate_percent))) {
            return { ok: false, error: `commission_schema.rules[${i}].rate_percent must be >= 0` };
        }
        if (rule.fixed_amount_rub != null && !isNonNegativeNumber(Number(rule.fixed_amount_rub))) {
            return { ok: false, error: `commission_schema.rules[${i}].fixed_amount_rub must be >= 0` };
        }
        if (rule.years != null) {
            const start = Number(rule.years.start);
            const end = Number(rule.years.end);
            if (!isPositiveInteger(start) || !isPositiveInteger(end) || end < start) {
                return { ok: false, error: `commission_schema.rules[${i}].years must contain valid start/end` };
            }
        }
        if (rule.tiers != null) {
            if (!Array.isArray(rule.tiers) || rule.tiers.length === 0) {
                return { ok: false, error: `commission_schema.rules[${i}].tiers must be a non-empty array` };
            }
            for (let j = 0; j < rule.tiers.length; j += 1) {
                const tier = rule.tiers[j];
                if (!tier || typeof tier !== 'object') {
                    return { ok: false, error: `commission_schema.rules[${i}].tiers[${j}] must be an object` };
                }
                const from = Number(tier.year_from);
                const to = Number(tier.year_to);
                const rate = Number(tier.rate_percent);
                if (!isPositiveInteger(from) || !isPositiveInteger(to) || to < from) {
                    return { ok: false, error: `commission_schema.rules[${i}].tiers[${j}] has invalid year_from/year_to` };
                }
                if (!isNonNegativeNumber(rate)) {
                    return { ok: false, error: `commission_schema.rules[${i}].tiers[${j}].rate_percent must be >= 0` };
                }
            }
        }

        normalizedRules.push(rule);
    }

    return {
        ok: true,
        normalized: {
            version,
            rules: normalizedRules,
        },
    };
}

module.exports = {
    validateCommissionSchema,
    ALLOWED_RULE_TYPES: Array.from(ALLOWED_RULE_TYPES),
};

