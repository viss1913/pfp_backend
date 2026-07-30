/**
 * White-label Finam Report v2 для АТБ Банк (projectId 28): страхование жизни — «СК Лучи» вместо Сбер.
 * Не трогает шаблоны для проектов 14/23 — подстановка только при сборке HTML для meta.projectId === 28.
 */

const {
    ATB_LIFE_PROGRAM_LABEL,
    normalizeSberLifeProgramLabel,
} = require('../../algorithms/calculators/sberLifeProgramLabel');

const ATB_BANK_PROJECT_ID = 28;
const ATB_LIFE_PROVIDER_LABEL = 'СК Лучи';

function isAtbBankProject(projectId) {
    const n = Number(projectId);
    return Number.isFinite(n) && n === ATB_BANK_PROJECT_ID;
}

function looksSberLifeBranding(text) {
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return false;
    return /сбер/.test(t) && (/страхован|жизн|подушк|подписк|ск\s*сбер/.test(t) || t.includes('life'));
}

/**
 * @param {Record<string, unknown>} life
 * @param {unknown} projectId
 */
function applyAtbLifeGoalDisplay(life, projectId) {
    if (!isAtbBankProject(projectId) || !life || typeof life !== 'object') return life;
    let programName = normalizeSberLifeProgramLabel(life.programName, { atb: true });
    let provider = life.provider;
    const pn = String(programName || '');
    const pv = String(provider || '').trim();
    if (!pv || looksSberLifeBranding(pv) || /^сбер$/i.test(pv)) {
        provider = ATB_LIFE_PROVIDER_LABEL;
    }
    if (/сбер/i.test(pn) && !/ск\s*лучи/i.test(pn)) {
        programName = ATB_LIFE_PROGRAM_LABEL;
    }
    return { ...life, programName, provider };
}

/** Замена юр. имени страховщика в статическом тексте декларации о рисках v2. */
function atbBrandingRiskDeclarationHtml(html) {
    return String(html || '').replace(/«СК Сбер Страхование»/g, '«СК Лучи»');
}

module.exports = {
    ATB_BANK_PROJECT_ID,
    ATB_LIFE_PROGRAM_LABEL,
    ATB_LIFE_PROVIDER_LABEL,
    isAtbBankProject,
    applyAtbLifeGoalDisplay,
    atbBrandingRiskDeclarationHtml,
};
