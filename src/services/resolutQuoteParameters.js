'use strict';

const {
    isResolutIszhProduct,
    isResolutIszhPfpCode,
    buildIszhLikeParameters,
    normalizeIszhQuoteParameters
} = require('./resolutIszhQuoteParameters');
const {
    isResolutDepositLikeProduct,
    isResolutDepositLikePfpCode,
    looksLikeResolutDepositParameters,
    buildDepositLikeParameters,
    normalizeDepositQuoteParameters
} = require('./resolutDepositQuoteParameters');

/**
 * Единая сборка { code, parameters } для quote и portfolio (НСЖ или ИСЖ).
 */
function buildResolutQuoteParameters(opts) {
    const product = opts && opts.product;
    if (isResolutIszhProduct(product)) {
        return buildIszhLikeParameters(opts);
    }
    if (isResolutDepositLikeProduct(product)) {
        return buildDepositLikeParameters(opts);
    }
    const { buildNszhLikeParameters } = require('./resolutQuoteLineSuggestService');
    return buildNszhLikeParameters(opts);
}

/**
 * Нормализация строки quote/portfolio перед Resolut (ИСЖ: limit → premium).
 */
function mapResolutClientToClientRow(resolutClient) {
    if (!resolutClient || typeof resolutClient !== 'object') return {};
    return {
        birth_date: resolutClient.dob || null,
        gender: resolutClient.sex || null
    };
}

function normalizeResolutQuoteLine({ projectId, product = null, clientRow = {}, code, parameters, amountHint = null }) {
    const pfpCode = String(code || (product && product.resolut_pfp_code) || '').trim();
    const isDepositLike =
        isResolutDepositLikeProduct(product)
        || isResolutDepositLikePfpCode(pfpCode)
        || looksLikeResolutDepositParameters(parameters);
    if (!isResolutIszhProduct(product) && !isResolutIszhPfpCode(pfpCode) && !isDepositLike) {
        return { code: pfpCode || code, parameters };
    }
    if (isDepositLike) {
        return {
            code: pfpCode || code,
            parameters: normalizeDepositQuoteParameters({
                product,
                parameters,
                amountHint
            })
        };
    }
    const normalizedParameters = normalizeIszhQuoteParameters({
        projectId,
        product,
        clientRow,
        code: pfpCode,
        parameters,
        amountHint
    });
    return { code: pfpCode, parameters: normalizedParameters };
}

function normalizePortfolioQuotesPayload(projectId, payload = {}) {
    const clientRow = mapResolutClientToClientRow(payload.client);
    const quotesIn = Array.isArray(payload.quotes) ? payload.quotes : [];
    const quotes = quotesIn.map((q) => {
        const normalized = normalizeResolutQuoteLine({
            projectId,
            clientRow,
            code: q.code,
            parameters: q.parameters,
            amountHint: q.amount
        });
        return { code: normalized.code, parameters: normalized.parameters };
    });
    return { ...payload, quotes };
}

module.exports = {
    buildResolutQuoteParameters,
    normalizeResolutQuoteLine,
    normalizePortfolioQuotesPayload,
    mapResolutClientToClientRow,
    isResolutIszhProduct,
    buildIszhLikeParameters,
    normalizeIszhQuoteParameters
};
