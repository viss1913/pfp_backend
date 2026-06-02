'use strict';

const DEPOSIT_LIKE_PRODUCT_TYPES = new Set(['DEPOSIT', 'PDS']);
const CLIENT_TYPE_LABELS = {
    common: 'Общий',
    private: 'Привилегированный'
};
const DEFAULT_DEPOSIT_PFP_CODES = ['depAlfa', 'pdsAlfa'];

function resolveResolutProjectId() {
    const n = Number(process.env.RESOLUT_PROJECT_ID || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function isResolutPortfolioProduct(product, projectId) {
    const pid = Number(projectId);
    const allowed = resolveResolutProjectId();
    if (!allowed || pid !== allowed) return false;
    const code = product && product.resolut_pfp_code;
    return typeof code === 'string' && code.trim().length > 0;
}

function isResolutDepositLikeProduct(product) {
    if (!product || typeof product !== 'object') return false;
    const pt = String(product.product_type || '').trim().toUpperCase();
    if (DEPOSIT_LIKE_PRODUCT_TYPES.has(pt)) return true;
    return isResolutDepositLikePfpCode(product.resolut_pfp_code);
}

function parseDepositPfpCodes() {
    const raw = process.env.RESOLUT_DEPOSIT_PFP_CODES;
    if (raw == null || String(raw).trim() === '') {
        return [...DEFAULT_DEPOSIT_PFP_CODES];
    }
    return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function isResolutDepositLikePfpCode(code) {
    const c = String(code || '').trim();
    return c.length > 0 && parseDepositPfpCodes().includes(c);
}

function looksLikeResolutDepositParameters(parameters) {
    if (!parameters || typeof parameters !== 'object') return false;
    const calcData = parameters.calcData;
    if (!calcData || typeof calcData !== 'object') return false;
    if (parameters.clientType != null) return true;
    if (calcData.capitalise != null) return true;
    return false;
}

function normalizeDepositClientType(clientType) {
    const rawCode = typeof clientType === 'object' && clientType !== null
        ? clientType.code
        : clientType;
    const code = String(rawCode == null || rawCode === '' ? '' : rawCode).trim().toLowerCase();
    if (!CLIENT_TYPE_LABELS[code]) {
        throw {
            status: 400,
            error: 'INVALID_RESOLUT_CLIENT_TYPE',
            message: 'clientType is required and must be "common" or "private"'
        };
    }
    return {
        code,
        name: CLIENT_TYPE_LABELS[code]
    };
}

function resolveDepositTermValue(product, termMonths) {
    const raw = Number(termMonths);
    if (!Number.isFinite(raw) || raw <= 0) {
        throw {
            status: 400,
            error: 'INVALID_RESOLUT_DEPOSIT_TERM',
            message: 'term must be a positive integer'
        };
    }
    if (isResolutDepositLikeProduct(product) && String(product.product_type || '').trim().toUpperCase() === 'PDS') {
        return Math.max(1, Math.floor(raw / 12));
    }
    return Math.max(1, Math.floor(raw));
}

function normalizeDepositQuoteParameters({
    product = null,
    parameters = {},
    termMonths = null,
    amountHint = null,
    clientType = undefined,
    capitalise = undefined
}) {
    if (!parameters || typeof parameters !== 'object') {
        throw {
            status: 400,
            error: 'INVALID_RESOLUT_DEPOSIT_PARAMETERS',
            message: 'Deposit/PDS parameters must be an object'
        };
    }

    const calcDataIn = parameters.calcData && typeof parameters.calcData === 'object'
        ? parameters.calcData
        : {};
    const limitSource = amountHint != null ? amountHint : calcDataIn.limit;
    const limit = parseFloat(Number(limitSource).toFixed(2));
    if (!Number.isFinite(limit) || limit <= 0) {
        throw {
            status: 400,
            error: 'INVALID_AMOUNT',
            message: 'Deposit/PDS amount must be a positive number'
        };
    }

    const capitaliseValue = capitalise !== undefined ? capitalise : calcDataIn.capitalise;
    if (typeof capitaliseValue !== 'boolean') {
        throw {
            status: 400,
            error: 'INVALID_RESOLUT_DEPOSIT_CAPITALISE',
            message: 'Deposit/PDS capitalise must be explicitly set to true or false'
        };
    }

    const termSource = termMonths != null ? resolveDepositTermValue(product, termMonths) : calcDataIn.term;
    const numericTerm = Number(termSource);
    if (!Number.isFinite(numericTerm) || numericTerm <= 0) {
        throw {
            status: 400,
            error: 'INVALID_RESOLUT_DEPOSIT_TERM',
            message: 'Deposit/PDS term must be a positive integer'
        };
    }
    const term = Math.max(1, Math.floor(numericTerm));

    return {
        clientType: normalizeDepositClientType(clientType !== undefined ? clientType : parameters.clientType),
        calcData: {
            limit,
            capitalise: capitaliseValue,
            term
        }
    };
}

function buildDepositLikeParameters({
    projectId,
    product,
    termMonths,
    amount,
    clientType = 'common',
    capitalise = false
}) {
    if (!isResolutPortfolioProduct(product, projectId)) {
        throw {
            status: 400,
            error: 'PRODUCT_NOT_RESOLUT_ELIGIBLE',
            message: 'Product has no resolut_pfp_code or project is not Resolut tenant'
        };
    }
    if (!isResolutDepositLikeProduct(product)) {
        throw {
            status: 400,
            error: 'PRODUCT_NOT_DEPOSIT_LIKE',
            message: 'Product is not configured as DEPOSIT/PDS'
        };
    }

    const code = String(product.resolut_pfp_code).trim();
    return {
        code,
        parameters: normalizeDepositQuoteParameters({
            product,
            parameters: {},
            termMonths,
            amountHint: amount,
            clientType,
            capitalise
        })
    };
}

module.exports = {
    CLIENT_TYPE_LABELS,
    DEFAULT_DEPOSIT_PFP_CODES,
    isResolutDepositLikeProduct,
    parseDepositPfpCodes,
    isResolutDepositLikePfpCode,
    looksLikeResolutDepositParameters,
    normalizeDepositClientType,
    resolveDepositTermValue,
    normalizeDepositQuoteParameters,
    buildDepositLikeParameters
};
