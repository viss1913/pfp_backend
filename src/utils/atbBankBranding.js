const DEFAULT_SBER_LIFE_OFFER_URL = 'https://sberbank-insurance.ru/podushka-bezopasnosti';

/**
 * ATB tenants: legacy project 28 + новый tenant 3.
 * Оверрайд через env:
 *   ATB_BANK_PROJECT_IDS=3,28
 */
const DEFAULT_ATB_BANK_PROJECT_IDS = [3, 28];

const ATB_LIFE_PROGRAM_LABEL = 'Подушка безопасности · СК Лучи';
const ATB_LIFE_PROVIDER_LABEL = 'СК Лучи';
const ATB_LIFE_EMAIL_DESCRIPTION =
    'Подушка безопасности от СК Лучи — страховая защита с фиксированным тарифом 1,44% в год. ' +
    'Продукт покрывает риски травм, инвалидности I-II группы и ухода из жизни по ключевым сценариям.';

function parseAtbBankProjectIds() {
    const raw = process.env.ATB_BANK_PROJECT_IDS;
    if (raw == null || String(raw).trim() === '') {
        return new Set(DEFAULT_ATB_BANK_PROJECT_IDS);
    }
    const ids = String(raw)
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? new Set(ids) : new Set(DEFAULT_ATB_BANK_PROJECT_IDS);
}

function isAtbBankProject(projectId) {
    const n = Number(projectId);
    return Number.isFinite(n) && parseAtbBankProjectIds().has(n);
}

function looksSberLifeBranding(text) {
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return false;
    return /сбер/.test(t) && (/страхован|жизн|подушк|ск\s*сбер/.test(t) || t.includes('life'));
}

function replaceSberLifeBranding(text) {
    return String(text || '')
        .replace(/Подушка безопасности\s*[·•]?\s*Сбер Страхование Жизни/gi, ATB_LIFE_PROGRAM_LABEL)
        .replace(/Подушка безопасности\s*[·•]?\s*Сбер Страхование жизни/gi, ATB_LIFE_PROGRAM_LABEL)
        .replace(/Сбер Страхование Жизни/gi, ATB_LIFE_PROVIDER_LABEL)
        .replace(/Сбер Страхование жизни/gi, ATB_LIFE_PROVIDER_LABEL)
        .replace(/СК Сбер Страхование/gi, ATB_LIFE_PROVIDER_LABEL);
}

function resolveAtbLifeOfferUrl() {
    const raw = String(process.env.ATB_LIFE_OFFER_URL || '').trim();
    return raw || DEFAULT_SBER_LIFE_OFFER_URL;
}

/**
 * @param {Record<string, unknown>} life
 * @param {unknown} projectId
 */
function applyAtbLifeGoalDisplay(life, projectId) {
    if (!isAtbBankProject(projectId) || !life || typeof life !== 'object') return life;
    let programName = life.programName;
    let provider = life.provider;
    const pn = String(programName || '');
    const pv = String(provider || '').trim();
    if (!pv || looksSberLifeBranding(pv) || /^сбер$/i.test(pv)) {
        provider = ATB_LIFE_PROVIDER_LABEL;
    }
    if (!pn.trim() || looksSberLifeBranding(pn) || /подушка\s+безопасности\s*[·•]?\s*сбер/i.test(pn)) {
        programName = ATB_LIFE_PROGRAM_LABEL;
    } else if (/сбер/i.test(pn)) {
        programName = replaceSberLifeBranding(pn);
    }
    return { ...life, programName, provider };
}

/** Замена юр. имени страховщика в статическом тексте декларации о рисках v2. */
function atbBrandingRiskDeclarationHtml(html) {
    return replaceSberLifeBranding(html);
}

function applyAtbReportBranding(html, projectId) {
    if (!isAtbBankProject(projectId)) return String(html || '');
    return replaceSberLifeBranding(String(html || ''))
        .replaceAll(DEFAULT_SBER_LIFE_OFFER_URL, resolveAtbLifeOfferUrl());
}

function resolveLifeOfferEmailPayload(projectId, payload = {}) {
    const offerUrlRaw = String(payload.offerUrl || '').trim();
    const descriptionRaw = String(payload.shortDescription || '').trim();
    if (!isAtbBankProject(projectId)) {
        return {
            offerUrl: offerUrlRaw || DEFAULT_SBER_LIFE_OFFER_URL,
            shortDescription: descriptionRaw,
        };
    }
    return {
        offerUrl: offerUrlRaw || resolveAtbLifeOfferUrl(),
        shortDescription: descriptionRaw || ATB_LIFE_EMAIL_DESCRIPTION,
    };
}

module.exports = {
    DEFAULT_SBER_LIFE_OFFER_URL,
    DEFAULT_ATB_BANK_PROJECT_IDS,
    ATB_LIFE_PROGRAM_LABEL,
    ATB_LIFE_PROVIDER_LABEL,
    ATB_LIFE_EMAIL_DESCRIPTION,
    parseAtbBankProjectIds,
    isAtbBankProject,
    looksSberLifeBranding,
    replaceSberLifeBranding,
    resolveAtbLifeOfferUrl,
    applyAtbLifeGoalDisplay,
    atbBrandingRiskDeclarationHtml,
    applyAtbReportBranding,
    resolveLifeOfferEmailPayload,
};
