const { normalizeMysqlDate } = require('./normalizeMysqlDate');

/**
 * "150 000", "150\u00a0000", "150,5" → number. Фронт (особенно mobile) часто шлёт formatted strings.
 * @param {unknown} value
 * @returns {number}
 */
function parseMoneyishNumber(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = String(value)
        .replace(/\s/g, '')
        .replace(/\u00a0/g, '')
        .replace(/,/g, '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {unknown} value
 * @param {string} key
 */
function coerceNumericField(obj, key) {
    if (!obj || typeof obj !== 'object' || !(key in obj)) return;
    const parsed = parseMoneyishNumber(obj[key]);
    if (Number.isFinite(parsed)) {
        obj[key] = parsed;
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
    const rootAssets = Array.isArray(body.assets) ? body.assets : [];
    const clientAssets = Array.isArray(body.client.assets) ? body.client.assets : [];
    if (rootAssets.length > 0 && clientAssets.length === 0) {
        body.client.assets = rootAssets;
    }

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
