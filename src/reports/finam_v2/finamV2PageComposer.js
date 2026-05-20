const { FINAM_REPORT_V2_PAGE_TYPES, FINAM_REPORT_V2_SCHEMA_VERSION } = require('./finamReportV2Contract');
const {
    FINAM_V2_SUMMARY_PAGE_ORDER,
    FINAM_V2_TEMPLATE_MANIFEST,
} = require('./finamV2PageManifest');
const { resolveTailPageOrder } = require('./finamV2SberPageConfig');
const {
    loadTemplateDocument,
    loadTemplatePhysicalPages,
    splitFinamV2DocumentIntoPhysicalPages,
} = require('./finamV2TemplateLoader');
const { applyTemplateData } = require('./finamV2TemplateAppliers');

function defaultGoalPageType(goal) {
    const type = String(goal?.goal_type || '').toUpperCase();
    const id = Number(goal?.goal_type_id);
    if (type === 'FIN_RESERVE') return FINAM_REPORT_V2_PAGE_TYPES.GOAL_FIN_RESERVE;
    if (type === 'LIFE') return FINAM_REPORT_V2_PAGE_TYPES.GOAL_LIFE;
    if (type === 'PENSION') return FINAM_REPORT_V2_PAGE_TYPES.GOAL_PENSION;
    if (type === 'PASSIVE_INCOME' || type === 'RENT' || id === 2 || id === 8) {
        return FINAM_REPORT_V2_PAGE_TYPES.GOAL_PASSIVE_INCOME;
    }
    if (type === 'INVESTMENT') return FINAM_REPORT_V2_PAGE_TYPES.GOAL_SAVE_GROW;
    return FINAM_REPORT_V2_PAGE_TYPES.GOAL_OTHER;
}

function loadAppliedPhysicalPages({ pageType, model, goal = null, helpers = {} }) {
    const spec = FINAM_V2_TEMPLATE_MANIFEST[pageType];
    if (!spec) return [];

    if (pageType === FINAM_REPORT_V2_PAGE_TYPES.DETAILED_PLAN) {
        const fullDoc = loadTemplateDocument(spec.fileName);
        const applied = applyTemplateData(fullDoc, {
            model,
            pageType,
            goal,
            helpers,
        });
        return splitFinamV2DocumentIntoPhysicalPages(applied);
    }

    return loadTemplatePhysicalPages(spec.fileName).map((html) =>
        applyTemplateData(html, {
            model,
            pageType,
            goal,
            helpers,
        })
    );
}

function makeTocItem({ section, index, pageStart }) {
    return {
        id: `finam_v2_${section.type}_${index + 1}`,
        title: section.title,
        order: index + 1,
        page_start: pageStart,
        page_count: section.physicalPages.length,
        report_schema_version: FINAM_REPORT_V2_SCHEMA_VERSION,
    };
}

function buildFinamV2TemplatePackage({
    model,
    includeCover = true,
    includeSummary = true,
    includePartnerValue = false,
    helpers = {},
} = {}) {
    const sections = [];
    const goalPageType = helpers.goalPageType || defaultGoalPageType;

    function addSection(pageType, goal = null) {
        const spec = FINAM_V2_TEMPLATE_MANIFEST[pageType];
        if (!spec) return;
        const physicalPages = loadAppliedPhysicalPages({ pageType, model, goal, helpers });
        if (!physicalPages.length) return;
        sections.push({
            type: pageType,
            title: goal && helpers.goalDisplayName ? helpers.goalDisplayName(goal) : spec.title,
            templateFileName: spec.fileName,
            page_count: physicalPages.length,
            physicalPages,
            goal_id: goal?.goal_id ?? null,
        });
    }

    if (includeCover !== false) addSection(FINAM_REPORT_V2_PAGE_TYPES.COVER);
    if (includeSummary !== false) {
        for (const pageType of FINAM_V2_SUMMARY_PAGE_ORDER) addSection(pageType);
    }

    for (const goal of Array.isArray(model?.goals) ? model.goals : []) {
        addSection(goalPageType(goal), goal);
    }

    const tailOrder = resolveTailPageOrder(model?.meta?.projectId);
    for (const pageType of tailOrder) addSection(pageType);
    if (includePartnerValue) addSection(FINAM_REPORT_V2_PAGE_TYPES.PARTNER_VALUE);

    const pageHtmlList = [];
    const toc = [];
    const pages = sections.map((section, index) => {
        const pageStart = pageHtmlList.length + 1;
        pageHtmlList.push(...section.physicalPages);
        toc.push(makeTocItem({ section, index, pageStart }));
        return {
            type: section.type,
            title: section.title,
            templateFileName: section.templateFileName,
            page_start: pageStart,
            page_count: section.physicalPages.length,
            goal_id: section.goal_id,
            html: section.physicalPages.join('\n'),
        };
    });

    return {
        reportSchemaVersion: FINAM_REPORT_V2_SCHEMA_VERSION,
        pageHtmlList,
        toc,
        pages,
        model,
    };
}

function buildFinamV2TemplatePageHtml({
    model,
    pageType,
    goal = null,
    helpers = {},
} = {}) {
    const spec = FINAM_V2_TEMPLATE_MANIFEST[pageType];
    if (!spec) return null;
    return applyTemplateData(loadTemplateDocument(spec.fileName), {
        model,
        pageType,
        goal,
        helpers,
    });
}

module.exports = {
    buildFinamV2TemplatePackage,
    buildFinamV2TemplatePageHtml,
};
