'use strict';

const { formatDobDdMmYyyy, normalizeSex } = require('./resolutNsjQuoteService');
const { isResolutPortfolioProduct } = require('./resolutPortfolioQuoteYieldService');

/** Демо/прод: «Капитал под управлением» → pfpCode capital (OpenAPI ver3, api-resolute 003). */
const DEFAULT_ISZH_PFP_CODES = ['capital'];

function parseIszhPfpCodes() {
    const raw = process.env.RESOLUT_ISZH_PFP_CODES;
    if (raw == null || String(raw).trim() === '') {
        return [...DEFAULT_ISZH_PFP_CODES];
    }
    return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * ИСЖ: product_type ISZH или resolut_pfp_code из RESOLUT_ISZH_PFP_CODES (по умолчанию capital).
 */
function isResolutIszhPfpCode(code) {
    const c = String(code || '').trim();
    return c.length > 0 && parseIszhPfpCodes().includes(c);
}

function isResolutIszhProduct(product) {
    if (!product || typeof product !== 'object') return false;
    const pt = String(product.product_type || '').toUpperCase().trim();
    if (pt === 'ISZH') return true;
    return isResolutIszhPfpCode(product.resolut_pfp_code);
}

/**
 * ИСЖ: premium из calcData.premium, иначе limit (фронт часто шлёт byLimit как для НСЖ).
 */
function pickIszhPremiumFromParameters(parameters, amountHint = null) {
    const cd = parameters && typeof parameters.calcData === 'object' ? parameters.calcData : {};
    const premium = Number(cd.premium);
    if (Number.isFinite(premium) && premium > 0) {
        return parseFloat(premium.toFixed(2));
    }
    const limit = Number(cd.limit);
    if (Number.isFinite(limit) && limit > 0) {
        return parseFloat(limit.toFixed(2));
    }
    const hint = Number(amountHint);
    if (Number.isFinite(hint) && hint > 0) {
        return parseFloat(hint.toFixed(2));
    }
    return null;
}

/**
 * Привести parameters к схеме ИСЖ (calcData.premium + insuredPerson).
 * Если premium уже есть — только убираем лишние поля НСЖ (term, pType, valuationType).
 */
function normalizeIszhQuoteParameters({
    projectId,
    product,
    clientRow = {},
    code,
    parameters,
    amountHint = null
}) {
    const pfpCode = String(code || (product && product.resolut_pfp_code) || '').trim();
    const isIszh =
        (product && isResolutIszhProduct(product)) || isResolutIszhPfpCode(pfpCode);
    if (!isIszh || !parameters || typeof parameters !== 'object') {
        return parameters;
    }

    const premium = pickIszhPremiumFromParameters(parameters, amountHint);
    if (!Number.isFinite(premium) || premium <= 0) {
        throw {
            status: 400,
            error: 'ISZH_PREMIUM_REQUIRED',
            message:
                'Для ИСЖ укажите размер взноса: calcData.premium (или calcData.limit как сумму взноса). Мин. на демо для capital — 1 500 000 ₽.'
        };
    }

    const insuredIn = parameters.insuredPerson && typeof parameters.insuredPerson === 'object'
        ? parameters.insuredPerson
        : {};
    const stubProduct = product && product.resolut_pfp_code
        ? product
        : { resolut_pfp_code: pfpCode, product_type: 'ISZH' };

    const built = buildIszhLikeParameters({
        projectId,
        product: stubProduct,
        clientRow: {
            ...clientRow,
            birth_date: clientRow.birth_date || insuredIn.dob || null,
            gender: clientRow.gender || clientRow.sex || insuredIn.sex || null
        },
        amount: premium
    });

    if (insuredIn.dob && typeof insuredIn.dob === 'string') {
        built.parameters.insuredPerson.dob = String(insuredIn.dob).trim();
    }
    if (insuredIn.sex) {
        built.parameters.insuredPerson.sex = normalizeSex(insuredIn);
    }

    return built.parameters;
}

/**
 * parameters для quote/portfolio по схеме ИСЖ (партнёр OpenAPI ver3 / QuoteParametersISG).
 * amount — страховой взнос (calcData.premium). Те же parameters в portfolio, что в quote.
 */
function buildIszhLikeParameters({ projectId, product, clientRow, amount }) {
    if (!isResolutPortfolioProduct(product, projectId)) {
        throw {
            status: 400,
            error: 'PRODUCT_NOT_RESOLUT_ELIGIBLE',
            message: 'Product has no resolut_pfp_code or project is not Resolut tenant'
        };
    }
    if (!isResolutIszhProduct(product)) {
        throw {
            status: 400,
            error: 'PRODUCT_NOT_ISZH',
            message: 'Product is not configured as ISZH (product_type ISZH or RESOLUT_ISZH_PFP_CODES)'
        };
    }

    const code = String(product.resolut_pfp_code).trim();
    const premium = parseFloat(Number(amount).toFixed(2));
    if (!Number.isFinite(premium) || premium <= 0) {
        throw {
            status: 400,
            error: 'INVALID_AMOUNT',
            message: 'amount must be a positive number (insurance premium for ISZH)'
        };
    }

    const dob = clientRow.birth_date
        ? formatDobDdMmYyyy(clientRow.birth_date)
        : formatDobDdMmYyyy(new Date('1985-01-01'));
    const sex = normalizeSex(clientRow);

    return {
        code,
        parameters: {
            calcData: { premium },
            insuredPerson: { dob, sex }
        }
    };
}

module.exports = {
    DEFAULT_ISZH_PFP_CODES,
    parseIszhPfpCodes,
    isResolutIszhPfpCode,
    isResolutIszhProduct,
    pickIszhPremiumFromParameters,
    normalizeIszhQuoteParameters,
    buildIszhLikeParameters
};
