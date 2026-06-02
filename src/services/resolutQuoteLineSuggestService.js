'use strict';

const resolutService = require('./resolutService');
const clientRepository = require('../repositories/clientRepository');
const productRepository = require('../repositories/productRepository');
const { formatDobDdMmYyyy, normalizeSex } = require('./resolutNsjQuoteService');
const { isResolutPortfolioProduct, pickPType } = require('./resolutPortfolioQuoteYieldService');
const { isResolutIszhProduct } = require('./resolutIszhQuoteParameters');
const { isResolutDepositLikeProduct } = require('./resolutDepositQuoteParameters');

/** Имена периодичности взноса — как в openapi/OPENAPI_SPEC.yaml (resolut_quote_p_type). */
const PTYPE_OPENAPI_NAMES = {
    0: 'единовременно',
    1: 'ежегодно',
    2: 'раз в полгода',
    4: 'ежеквартально',
    12: 'ежемесячно'
};

function nszhParametersShape() {
    const v = String(process.env.RESOLUT_NSZH_PARAMETERS_SHAPE || 'openapi').toLowerCase();
    return v === 'flat' ? 'flat' : 'openapi';
}

/** В OpenAPI 002 в calcData только valuationType/premium/limit; лишнее поле может ломать строгий portfolio. */
function includeCalcDataMonthlyIncome() {
    return String(process.env.RESOLUT_CALCDATA_MONTHLY_INCOME || '').toLowerCase() === 'true';
}

/**
 * Сборка parameters для quote/portfolio по схеме НСЖ/накоп (currency, pType, term, insuredPerson, calcData).
 * По умолчанию — формат партнёрского OpenAPI 002 (объекты currency и pType). Откат: RESOLUT_NSZH_PARAMETERS_SHAPE=flat.
 * Подходит для продуктов с resolut_pfp_code в духе assetShort; для иных схем партнёра фронт собирает parameters вручную.
 */
function buildNszhLikeParameters({
    projectId,
    product,
    clientRow,
    termMonths,
    amount,
    valuationType = 'byLimit',
    pTypeOverride = null
}) {
    if (!isResolutPortfolioProduct(product, projectId)) {
        throw {
            status: 400,
            error: 'PRODUCT_NOT_RESOLUT_ELIGIBLE',
            message: 'Product has no resolut_pfp_code or project is not Resolut tenant'
        };
    }
    const code = String(product.resolut_pfp_code).trim();
    const pType = pTypeOverride != null ? Number(pTypeOverride) : pickPType(product);
    if (![0, 1, 2, 4, 12].includes(pType)) {
        throw {
            status: 400,
            error: 'INVALID_P_TYPE',
            message: 'p_type must be 0, 1, 2, 4 or 12'
        };
    }
    const termYears = Math.max(1, Math.floor(Number(termMonths || 12) / 12));
    const dob = clientRow.birth_date
        ? formatDobDdMmYyyy(clientRow.birth_date)
        : formatDobDdMmYyyy(new Date('1985-01-01'));
    const sex = normalizeSex(clientRow);
    const rounded = parseFloat(Number(amount).toFixed(2));
    if (!Number.isFinite(rounded) || rounded <= 0) {
        throw {
            status: 400,
            error: 'INVALID_AMOUNT',
            message: 'amount must be a positive number'
        };
    }

    const vt = valuationType === 'byPremium' ? 'byPremium' : 'byLimit';
    const calcData = vt === 'byPremium'
        ? { valuationType: 'byPremium', premium: rounded }
        : { valuationType: 'byLimit', limit: rounded };

    if (includeCalcDataMonthlyIncome()) {
        const incomeRaw = clientRow.avg_monthly_income ?? clientRow.monthly_income;
        const incomeNum = Number(incomeRaw);
        if (Number.isFinite(incomeNum) && incomeNum > 0) {
            calcData.monthlyIncome = parseFloat(incomeNum.toFixed(2));
        }
    }

    if (nszhParametersShape() === 'flat') {
        return {
            code,
            parameters: {
                currency: 'RUR',
                pType,
                term: termYears,
                insuredPerson: { dob, sex },
                calcData
            }
        };
    }

    return {
        code,
        parameters: {
            currency: { code: 'RUR', name: 'Рубль РФ' },
            pType: {
                code: pType,
                name: PTYPE_OPENAPI_NAMES[pType] || `код_${pType}`
            },
            term: termYears,
            insuredPerson: { dob, sex },
            calcData
        }
    };
}

class ResolutQuoteLineSuggestService {
    async suggest({
        projectId,
        clientId,
        productId,
        termMonths = 120,
        amount,
        valuationType = 'byLimit',
        pTypeOverride = null,
        clientType = undefined,
        capitalise = undefined,
        userId = null
    }) {
        resolutService.assertProjectAllowed(projectId);

        const client = await clientRepository.findById(clientId, projectId);
        if (!client) {
            throw {
                status: 404,
                error: 'CLIENT_NOT_FOUND',
                message: 'Client not found or no access in project scope'
            };
        }
        const product = await productRepository.findById(productId, projectId);
        if (!product) {
            throw {
                status: 404,
                error: 'PRODUCT_NOT_FOUND',
                message: 'Product not found'
            };
        }

        const { buildResolutQuoteParameters } = require('./resolutQuoteParameters');
        const isIszh = isResolutIszhProduct(product);
        const isDepositLike = isResolutDepositLikeProduct(product);
        if (isDepositLike && valuationType !== 'byLimit') {
            throw {
                status: 400,
                error: 'DEPOSIT_VALUATION_TYPE_UNSUPPORTED',
                message: 'DEPOSIT/PDS suggest-quote-line supports only valuation_type=byLimit'
            };
        }
        if (isDepositLike && pTypeOverride != null) {
            throw {
                status: 400,
                error: 'DEPOSIT_P_TYPE_UNSUPPORTED',
                message: 'DEPOSIT/PDS suggest-quote-line does not use p_type'
            };
        }
        const line = buildResolutQuoteParameters({
            projectId,
            product,
            clientRow: client,
            termMonths,
            amount,
            valuationType,
            pTypeOverride,
            clientType,
            capitalise
        });

        return {
            success: true,
            data: {
                client_id: Number(clientId),
                product_id: Number(productId),
                code: line.code,
                parameters: line.parameters,
                hints: isIszh
                    ? {
                        schema: 'iszh_like',
                        note: 'ИСЖ (OpenAPI ver3): calcData.premium + insuredPerson.dob/sex. Same parameters for POST /api/pfp/resolut/quote and portfolio quotes[]. Demo capital: min premium 1_500_000 RUR.'
                    }
                    : isDepositLike
                      ? {
                            schema: 'deposit_like',
                            note: 'DEPOSIT/PDS: clientType + calcData.limit/capitalise/term. PFP normalizes clientType ("common"/"private" or object) to upstream shape. term uses product units: DEPOSIT -> months, PDS -> years.'
                        }
                    : {
                        schema: 'nszh_like',
                        parameters_shape: nszhParametersShape(),
                        note: 'Use with POST /api/pfp/resolut/quote and publish quotes[]. Shape: openapi (default) or RESOLUT_NSZH_PARAMETERS_SHAPE=flat. Optional calcData.monthlyIncome only if RESOLUT_CALCDATA_MONTHLY_INCOME=true.'
                    }
            }
        };
    }
}

const resolutQuoteLineSuggestService = new ResolutQuoteLineSuggestService();
resolutQuoteLineSuggestService.buildNszhLikeParameters = buildNszhLikeParameters;
module.exports = resolutQuoteLineSuggestService;
