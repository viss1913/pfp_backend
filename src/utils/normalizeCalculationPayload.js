const { normalizeMysqlDate } = require('./normalizeMysqlDate');

/**
 * "150 000", "150\u00a0000", "150,5" → number. Фронт (особенно mobile) часто шлёт formatted strings.
 * @param {unknown} value
 * @returns {number}
 */
const MONEY_FIELD_KEYS = new Set([
    'avg_monthly_income',
    'spouse_avg_monthly_income',
    'total_liquid_capital',
    'ipk_current',
    'amount',
    'current_value',
    'target_amount',
    'term_months',
    'desired_monthly_income',
    'initial_capital',
    'inflation_rate',
    'monthly_replenishment',
    'payment_variant',
    'goal_type_id',
    'unlock_month',
    'sell_month',
    'balance',
    'monthlyPayment',
    'rate',
    'amount_monthly',
    'estimated_value',
    'monthly_income',
    'current_capital',
    'capital',
    'income',
    'salary',
    'savings',
]);

function parseMoneyishNumber(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

    let normalized = String(value)
        .trim()
        .replace(/[\s\u00a0\u202f\u2009\u2007\u2060]/g, '')
        .replace(/[₽руб]/gi, '')
        .replace(/\s+/g, '');

    if (normalized.includes(',') && !normalized.includes('.')) {
        normalized = normalized.replace(',', '.');
    } else {
        normalized = normalized.replace(/,/g, '');
    }

    const match = normalized.match(/^-?\d+(?:\.\d+)?/);
    if (!match) return NaN;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {unknown} value
 * @param {string} key
 */
function coerceNumericField(obj, key) {
    if (!obj || typeof obj !== 'object' || !(key in obj)) return;
    const raw = obj[key];
    if (raw === '' || raw === null) {
        delete obj[key];
        return;
    }
    const parsed = parseMoneyishNumber(raw);
    if (Number.isFinite(parsed)) {
        obj[key] = parsed;
    }
}

/**
 * @param {unknown} value
 */
function sanitizeRiskProfileAnswers(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [key, answer] of Object.entries(value)) {
        if (answer === '' || answer === null || answer === undefined) {
            delete value[key];
            continue;
        }
        if (typeof answer === 'string') {
            const trimmed = answer.trim();
            if (!trimmed) {
                delete value[key];
            }
        }
    }
}

/**
 * @param {unknown} node
 * @param {string|null} key
 */
function deepCoerceKnownNumericFields(node) {
    if (node == null) return;

    if (Array.isArray(node)) {
        for (const item of node) deepCoerceKnownNumericFields(item);
        return;
    }

    if (typeof node !== 'object') return;

    for (const [childKey, childValue] of Object.entries(node)) {
        if (MONEY_FIELD_KEYS.has(childKey)) {
            coerceNumericField(node, childKey);
        }
        if (childValue && typeof childValue === 'object') {
            deepCoerceKnownNumericFields(childValue);
        }
    }
}

/**
 * ISO YYYY-MM-DD или ДД.ММ.ГГГГ → YYYY-MM-DD для MySQL/калькуляторов.
 * @param {unknown} value
 * @returns {string|null|undefined}
 */
function normalizeFlexibleDate(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return value;

    const iso = normalizeMysqlDate(value);
    if (iso) return iso;

    const m = String(value).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
        return normalizeMysqlDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    }

    return value;
}

/**
 * @param {unknown} value
 * @param {string} key
 */
function coerceDateField(obj, key) {
    if (!obj || typeof obj !== 'object' || !(key in obj)) return;
    const normalized = normalizeFlexibleDate(obj[key]);
    if (normalized !== undefined) {
        obj[key] = normalized;
    }
}

/**
 * @param {Record<string, unknown>|null|undefined} client
 */
function normalizeClientBlock(client) {
    if (!client || typeof client !== 'object') return;

    if (typeof client.email === 'string' && client.email.trim() === '') {
        delete client.email;
    }

    if (client.income != null && client.avg_monthly_income == null) {
        client.avg_monthly_income = client.income;
    }
    if (client.monthly_income != null && client.avg_monthly_income == null) {
        client.avg_monthly_income = client.monthly_income;
    }
    if (client.current_capital != null && client.total_liquid_capital == null) {
        client.total_liquid_capital = client.current_capital;
    }
    if (client.capital != null && client.total_liquid_capital == null) {
        client.total_liquid_capital = client.capital;
    }

    coerceDateField(client, 'birth_date');
    coerceNumericField(client, 'avg_monthly_income');
    coerceNumericField(client, 'spouse_avg_monthly_income');
    coerceNumericField(client, 'total_liquid_capital');
    coerceNumericField(client, 'ipk_current');

    if (client.insured_person && typeof client.insured_person === 'object') {
        coerceDateField(client.insured_person, 'birth_date');
    }

    const fp = client.family_profile;
    if (fp && typeof fp === 'object' && !Array.isArray(fp)) {
        if (Array.isArray(fp.children)) {
            for (const child of fp.children) {
                if (child && typeof child === 'object') {
                    coerceDateField(child, 'birth_date');
                }
            }
        }
        if (fp.spouse && typeof fp.spouse === 'object') {
            coerceNumericField(fp.spouse, 'monthly_income');
        }
        if (Array.isArray(fp.family_obligations)) {
            for (const item of fp.family_obligations) {
                if (item && typeof item === 'object') {
                    coerceNumericField(item, 'amount_monthly');
                }
            }
        }
        if (Array.isArray(fp.real_estate)) {
            for (const item of fp.real_estate) {
                if (item && typeof item === 'object') {
                    coerceNumericField(item, 'estimated_value');
                }
            }
        }
    }

    if (Array.isArray(client.tax_children)) {
        for (const child of client.tax_children) {
            if (child && typeof child === 'object') {
                coerceDateField(child, 'birth_date');
            }
        }
    }

    if (Array.isArray(client.assets)) {
        for (const asset of client.assets) {
            if (!asset || typeof asset !== 'object') continue;
            coerceNumericField(asset, 'amount');
            coerceNumericField(asset, 'current_value');
            coerceNumericField(asset, 'unlock_month');
            coerceNumericField(asset, 'sell_month');
        }
    }

    sanitizeRiskProfileAnswers(client.risk_profile_answers);
}

/**
 * @param {Record<string, unknown>|null|undefined} goal
 */
function normalizeGoalBlock(goal) {
    if (!goal || typeof goal !== 'object') return;

    coerceNumericField(goal, 'goal_type_id');
    coerceNumericField(goal, 'target_amount');
    coerceNumericField(goal, 'term_months');
    coerceNumericField(goal, 'desired_monthly_income');
    coerceNumericField(goal, 'initial_capital');
    coerceNumericField(goal, 'inflation_rate');
    coerceNumericField(goal, 'avg_monthly_income');
    coerceNumericField(goal, 'monthly_replenishment');
    coerceNumericField(goal, 'payment_variant');
    coerceDateField(goal, 'start_date');
}

/**
 * Нормализует тело POST /client/calculate до Joi-валидации (mobile formatted numbers/dates).
 * @param {Record<string, unknown>} body
 */
function normalizeCalculationRequestBody(body) {
    if (!body || typeof body !== 'object') return;

    if (!body.client) body.client = {};
    if (body.total_liquid_capital != null && body.client.total_liquid_capital == null) {
        body.client.total_liquid_capital = body.total_liquid_capital;
    }
    if (body.current_capital != null && body.client.total_liquid_capital == null) {
        body.client.total_liquid_capital = body.current_capital;
    }
    if (body.capital != null && body.client.total_liquid_capital == null) {
        body.client.total_liquid_capital = body.capital;
    }

    const rootAssets = Array.isArray(body.assets) ? body.assets : [];
    const clientAssets = Array.isArray(body.client.assets) ? body.client.assets : [];
    if (rootAssets.length > 0 && clientAssets.length === 0) {
        body.client.assets = rootAssets;
    }

    deepCoerceKnownNumericFields(body);
    normalizeClientBlock(body.client);

    if (Array.isArray(body.goals)) {
        for (const goal of body.goals) {
            normalizeGoalBlock(goal);
        }
    }

    if (Array.isArray(body.assets)) {
        for (const asset of body.assets) {
            if (!asset || typeof asset !== 'object') continue;
            coerceNumericField(asset, 'amount');
            coerceNumericField(asset, 'current_value');
            coerceNumericField(asset, 'unlock_month');
            coerceNumericField(asset, 'sell_month');
        }
    }

    if (Array.isArray(body.credits)) {
        for (const credit of body.credits) {
            if (!credit || typeof credit !== 'object') continue;
            coerceNumericField(credit, 'balance');
            coerceNumericField(credit, 'monthlyPayment');
            coerceNumericField(credit, 'rate');
        }
    }
}

module.exports = {
    parseMoneyishNumber,
    normalizeFlexibleDate,
    normalizeCalculationRequestBody,
};
