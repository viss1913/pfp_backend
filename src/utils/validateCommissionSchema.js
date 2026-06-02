'use strict';

const COMMISSION_SCHEMA_VERSION = 1;
const MAX_PERCENT = 100;
const MAX_YEAR = 100;

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

const RULE_TYPE_META = {
    ONE_TIME_FIXED: {
        code: 'ONE_TIME_FIXED',
        label: 'Единовременная фиксированная',
        description: 'Фиксированная комиссия при продаже',
        required_fields: ['fixed_amount_rub'],
        optional_fields: ['name'],
        allowed_base: [],
        allowed_frequency: ['ONE_TIME'],
        supports_years: false,
        supports_tiers: false,
    },
    ONE_TIME_PERCENT_OF_PREMIUM: {
        code: 'ONE_TIME_PERCENT_OF_PREMIUM',
        label: 'Единовременная процентная',
        description: 'Процент от взноса при продаже',
        required_fields: ['rate_percent', 'base'],
        optional_fields: ['name'],
        allowed_base: ['INITIAL', 'FLOW', 'INITIAL_PLUS_FLOW'],
        allowed_frequency: ['ONE_TIME'],
        supports_years: false,
        supports_tiers: false,
    },
    FIRST_YEAR_PERCENT_OF_PREMIUMS: {
        code: 'FIRST_YEAR_PERCENT_OF_PREMIUMS',
        label: 'Процент от взносов первого года',
        description: 'Комиссия только за первый год',
        required_fields: ['rate_percent', 'base'],
        optional_fields: ['name', 'years'],
        allowed_base: ['INITIAL', 'FLOW', 'INITIAL_PLUS_FLOW'],
        allowed_frequency: ['YEARLY'],
        supports_years: true,
        supports_tiers: false,
    },
    ANNUAL_PERCENT_OF_PREMIUM: {
        code: 'ANNUAL_PERCENT_OF_PREMIUM',
        label: 'Ежегодная процентная',
        description: 'Ежегодная комиссия как процент от взноса',
        required_fields: ['rate_percent', 'base'],
        optional_fields: ['name', 'years'],
        allowed_base: ['INITIAL', 'FLOW', 'INITIAL_PLUS_FLOW'],
        allowed_frequency: ['YEARLY'],
        supports_years: true,
        supports_tiers: false,
    },
    AUM_MANAGEMENT_FEE: {
        code: 'AUM_MANAGEMENT_FEE',
        label: 'Management fee',
        description: 'Процент от AUM (средний капитал за период)',
        required_fields: ['rate_percent', 'base'],
        optional_fields: ['name', 'frequency', 'years'],
        allowed_base: ['AUM_AVG'],
        allowed_frequency: ['MONTHLY', 'YEARLY'],
        supports_years: true,
        supports_tiers: false,
    },
    TIERED_BY_YEAR: {
        code: 'TIERED_BY_YEAR',
        label: 'Градация по годам',
        description: 'Комиссия по таблице ставок по годам',
        required_fields: ['base', 'tiers'],
        optional_fields: ['name', 'frequency'],
        allowed_base: ['INITIAL', 'FLOW', 'INITIAL_PLUS_FLOW', 'AUM_AVG'],
        allowed_frequency: ['YEARLY'],
        supports_years: false,
        supports_tiers: true,
    },
};

const ALLOWED_RULE_TYPES = Object.keys(RULE_TYPE_META);

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

function buildValidationError(message, details) {
    return {
        ok: false,
        error: 'VALIDATION_ERROR',
        message: message || 'Invalid commission_schema',
        details: Array.isArray(details) ? details : [],
    };
}

function validationDetail(code, fieldPath, message) {
    return {
        code,
        field_path: fieldPath,
        message,
    };
}

function ensureNoUnexpectedFields(rule, index, allowed, details) {
    for (const key of Object.keys(rule)) {
        if (!allowed.has(key)) {
            details.push(validationDetail('FORBIDDEN_FIELD', `commission_schema.rules[${index}].${key}`, `Field "${key}" is not allowed for this rule_type`));
        }
    }
}

function validateYears(rule, index, details) {
    if (rule.years == null) return;
    const start = Number(rule.years.start);
    const end = Number(rule.years.end);
    if (!isPositiveInteger(start) || start < 1 || start > MAX_YEAR) {
        details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${index}].years.start`, `years.start must be between 1 and ${MAX_YEAR}`));
    }
    if (!isPositiveInteger(end) || end < 1 || end > MAX_YEAR) {
        details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${index}].years.end`, `years.end must be between 1 and ${MAX_YEAR}`));
    }
    if (isPositiveInteger(start) && isPositiveInteger(end) && end < start) {
        details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${index}].years`, 'years.end must be greater than or equal to years.start'));
    }
}

function validateTiers(rule, index, details) {
    if (rule.tiers == null) return;
    if (!Array.isArray(rule.tiers) || rule.tiers.length === 0) {
        details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${index}].tiers`, 'tiers must be a non-empty array'));
        return;
    }
    const sorted = [...rule.tiers].sort((a, b) => Number(a.year_from) - Number(b.year_from));
    for (let j = 0; j < sorted.length; j += 1) {
        const tier = sorted[j] || {};
        const from = Number(tier.year_from);
        const to = Number(tier.year_to);
        const rate = Number(tier.rate_percent);
        const basePath = `commission_schema.rules[${index}].tiers[${j}]`;
        if (!isPositiveInteger(from) || from < 1 || from > MAX_YEAR) {
            details.push(validationDetail('INVALID_FIELD', `${basePath}.year_from`, `year_from must be between 1 and ${MAX_YEAR}`));
        }
        if (!isPositiveInteger(to) || to < 1 || to > MAX_YEAR) {
            details.push(validationDetail('INVALID_FIELD', `${basePath}.year_to`, `year_to must be between 1 and ${MAX_YEAR}`));
        }
        if (isPositiveInteger(from) && isPositiveInteger(to) && to < from) {
            details.push(validationDetail('INVALID_FIELD', `${basePath}.year_to`, 'year_to must be greater than or equal to year_from'));
        }
        if (!Number.isFinite(rate) || rate < 0 || rate > MAX_PERCENT) {
            details.push(validationDetail('INVALID_FIELD', `${basePath}.rate_percent`, `rate_percent must be between 0 and ${MAX_PERCENT}`));
        }
        if (j > 0) {
            const prev = sorted[j - 1];
            const prevTo = Number(prev.year_to);
            if (Number.isFinite(prevTo) && Number.isFinite(from) && from <= prevTo) {
                details.push(validationDetail('OVERLAPPING_TIERS', `${basePath}.year_from`, 'tiers must not overlap'));
            }
        }
    }
}

function validateCommissionSchema(raw) {
    const schema = asObject(raw);
    if (schema == null) {
        return { ok: true, normalized: null };
    }

    const details = [];
    const version = Number(schema.version == null ? COMMISSION_SCHEMA_VERSION : schema.version);
    if (!Number.isInteger(version) || version <= 0) {
        details.push(validationDetail('INVALID_FIELD', 'commission_schema.version', 'commission_schema.version must be a positive integer'));
    }

    if (!Array.isArray(schema.rules)) {
        details.push(validationDetail('INVALID_FIELD', 'commission_schema.rules', 'commission_schema.rules must be an array'));
    } else if (schema.rules.length === 0) {
        details.push(validationDetail('INVALID_FIELD', 'commission_schema.rules', 'commission_schema.rules must not be empty'));
    }

    if (details.length > 0) {
        return buildValidationError('Invalid commission_schema', details);
    }

    const normalizedRules = [];
    for (let i = 0; i < schema.rules.length; i += 1) {
        const sourceRule = schema.rules[i];
        if (!sourceRule || typeof sourceRule !== 'object' || Array.isArray(sourceRule)) {
            details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}]`, 'rule must be an object'));
            continue;
        }
        const rule = normalizeRule(sourceRule);
        if (!RULE_TYPE_META[rule.rule_type]) {
            details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].rule_type`, 'rule_type is invalid'));
            continue;
        }
        const meta = RULE_TYPE_META[rule.rule_type];

        if (rule.base != null && !ALLOWED_BASES.has(rule.base)) {
            details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].base`, 'base is invalid'));
        }
        if (rule.frequency != null && !ALLOWED_FREQUENCIES.has(rule.frequency)) {
            details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].frequency`, 'frequency is invalid'));
        }
        if (rule.rate_percent != null) {
            const rate = Number(rule.rate_percent);
            if (!Number.isFinite(rate) || rate < 0 || rate > MAX_PERCENT) {
                details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].rate_percent`, `rate_percent must be between 0 and ${MAX_PERCENT}`));
            }
        }
        if (rule.fixed_amount_rub != null) {
            const amount = Number(rule.fixed_amount_rub);
            if (!isNonNegativeNumber(amount)) {
                details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].fixed_amount_rub`, 'fixed_amount_rub must be >= 0'));
            }
        }

        const required = new Set(meta.required_fields);
        for (const reqField of required) {
            if (rule[reqField] == null || rule[reqField] === '') {
                details.push(validationDetail('MISSING_REQUIRED_FIELD', `commission_schema.rules[${i}].${reqField}`, `Field "${reqField}" is required for ${rule.rule_type}`));
            }
        }

        if (rule.base != null && meta.allowed_base.length && !meta.allowed_base.includes(rule.base)) {
            details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].base`, `base is not allowed for ${rule.rule_type}`));
        }
        if (rule.frequency != null && meta.allowed_frequency.length && !meta.allowed_frequency.includes(rule.frequency)) {
            details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].frequency`, `frequency is not allowed for ${rule.rule_type}`));
        }

        if (!meta.supports_years && rule.years != null) {
            details.push(validationDetail('FORBIDDEN_FIELD', `commission_schema.rules[${i}].years`, `years is not allowed for ${rule.rule_type}`));
        } else {
            validateYears(rule, i, details);
        }
        if (!meta.supports_tiers && rule.tiers != null) {
            details.push(validationDetail('FORBIDDEN_FIELD', `commission_schema.rules[${i}].tiers`, `tiers is not allowed for ${rule.rule_type}`));
        } else {
            validateTiers(rule, i, details);
        }

        const allowed = new Set([
            'rule_type',
            ...meta.required_fields,
            ...meta.optional_fields,
        ]);
        ensureNoUnexpectedFields(rule, i, allowed, details);

        if (rule.frequency == null && meta.allowed_frequency.length === 1) {
            rule.frequency = meta.allowed_frequency[0];
        }
        if (rule.base == null && meta.allowed_base.length === 1) {
            rule.base = meta.allowed_base[0];
        }
        if (rule.tiers && Array.isArray(rule.tiers)) {
            rule.tiers = [...rule.tiers]
                .map((t) => ({
                    year_from: Number(t.year_from),
                    year_to: Number(t.year_to),
                    rate_percent: Number(t.rate_percent),
                }))
                .sort((a, b) => a.year_from - b.year_from);
        }
        if (rule.years) {
            rule.years = {
                start: Number(rule.years.start),
                end: Number(rule.years.end),
            };
        }
        if (rule.rate_percent != null) {
            rule.rate_percent = Number(rule.rate_percent);
        }
        if (rule.fixed_amount_rub != null) {
            rule.fixed_amount_rub = Number(rule.fixed_amount_rub);
        }

        if (meta.code === 'TIERED_BY_YEAR' && rule.rate_percent != null) {
            details.push(validationDetail('FORBIDDEN_FIELD', `commission_schema.rules[${i}].rate_percent`, 'rate_percent is not allowed for TIERED_BY_YEAR (use tiers[])'));
        }
        if (meta.code === 'ONE_TIME_FIXED' && (rule.base != null || rule.frequency != null)) {
            if (rule.base != null) {
                details.push(validationDetail('FORBIDDEN_FIELD', `commission_schema.rules[${i}].base`, 'base is not allowed for ONE_TIME_FIXED'));
            }
            if (rule.frequency != null && rule.frequency !== 'ONE_TIME') {
                details.push(validationDetail('INVALID_FIELD', `commission_schema.rules[${i}].frequency`, 'frequency must be ONE_TIME'));
            }
        }

        normalizedRules.push(rule);
    }

    if (details.length > 0) {
        return buildValidationError('Invalid commission_schema', details);
    }

    return {
        ok: true,
        normalized: {
            version,
            rules: normalizedRules,
        },
    };
}

function getCommissionSchemaMeta() {
    return {
        version: COMMISSION_SCHEMA_VERSION,
        rule_types: Object.values(RULE_TYPE_META),
        field_constraints: {
            rate_percent: { min: 0, max: MAX_PERCENT },
            fixed_amount_rub: { min: 0 },
            'years.start': { min: 1, max: MAX_YEAR },
            'years.end': { min: 1, max: MAX_YEAR },
            'tier.year_from': { min: 1, max: MAX_YEAR },
            'tier.year_to': { min: 1, max: MAX_YEAR },
            'tier.rate_percent': { min: 0, max: MAX_PERCENT },
        },
    };
}

module.exports = {
    validateCommissionSchema,
    getCommissionSchemaMeta,
    ALLOWED_RULE_TYPES,
};

