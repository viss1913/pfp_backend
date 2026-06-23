const {
    ROSTECH_PROJECT_ID,
    NPF_RENESSANS_PROJECT_ID,
} = require('../themeResolver');

const ROSTECH_PDS_URL = 'https://lk.rostecnpf.ru/new-contract/pds/';
const NPF_RENESSANS_PDS_URL = 'https://shop.rensave.ru/products/pds';

const ROSTECH_BRANDING = Object.freeze({
    projectId: ROSTECH_PROJECT_ID,
    npfLegalName: 'АО «НПФ «Ростех»',
    npfShortName: 'НПФ Ростех',
    startPdsUrl: ROSTECH_PDS_URL,
    footerPension: 'НПФ Ростех • Госпенсия',
    footerInvestment: 'НПФ Ростех • Сохранить и приумножить',
    footerMethodologyTail: 'Ренессанс Накопления • Финам • Ренессанс Жизнь',
    useRostechLogo: true,
    pdsContractStep: '1. Заключить договор долгосрочных сбережений (ПДС) в АО «НПФ «Ростех».',
    portfolioYieldNote:
        'Это позволяет снизить риски потерь при инвестировании. В 2025 году НПФ Ростех заработал своим клиентам на ДДС в среднем 19% годовых.',
    inflationRiskIntro:
        'План объединяет решения в контурах НПФ «Ренессанс Накопления», инвестиционной платформы «Финам» и страховых продуктов «СК Ренессанс Жизнь». Во всех контурах используется прогноз инфляции, но фактическая динамика цен может отличаться от сценария. Это создает следующие риски:',
    npfBankruptcyIntro:
        'Для пенсионной части плана используется НПФ «Ренессанс Накопления». Теоретически риск финансовой нестабильности фонда может привести к:',
});

const NPF_RENESSANS_BRANDING = Object.freeze({
    projectId: NPF_RENESSANS_PROJECT_ID,
    npfLegalName: 'АО «НПФ «Ренессанс Накопления»',
    npfShortName: 'НПФ «Ренессанс Накопления»',
    startPdsUrl: NPF_RENESSANS_PDS_URL,
    footerPension: 'НПФ «Ренессанс Накопления» • Госпенсия',
    footerInvestment: 'НПФ «Ренессанс Накопления» • Сохранить и приумножить',
    footerMethodologyTail: 'НПФ «Ренессанс Накопления»',
    useRostechLogo: false,
    pdsContractStep:
        '1. Заключить договор долгосрочных сбережений (ПДС) в АО «НПФ «Ренессанс Накопления».',
    portfolioYieldNote:
        'Это позволяет снизить риски потерь при инвестировании. По программе ПДС НПФ «Ренессанс Накопления» доходность за 2024 год составила 39,45% (прогнозная ставка не гарантирует будущий результат).',
    inflationRiskIntro:
        'План строится на программе долгосрочных сбережений (ПДС) в НПФ «Ренессанс Накопления». В расчётах используется прогноз инфляции, но фактическая динамика цен может отличаться от сценария. Это создаёт следующие риски:',
    npfBankruptcyIntro:
        'Для пенсионной части плана используется НПФ «Ренессанс Накопления». Теоретически риск финансовой нестабильности фонда может привести к:',
});

/**
 * Копирайт/ссылки для purple PDF (Ростех 22 vs НПФ Ренессанс 4). Вёрстка общая.
 */
function resolveRostechStyleReportBranding(projectId) {
    const pid = projectId == null ? null : Number(projectId);
    if (pid === NPF_RENESSANS_PROJECT_ID) return NPF_RENESSANS_BRANDING;
    return ROSTECH_BRANDING;
}

module.exports = {
    ROSTECH_PDS_URL,
    NPF_RENESSANS_PDS_URL,
    ROSTECH_BRANDING,
    NPF_RENESSANS_BRANDING,
    resolveRostechStyleReportBranding,
};
