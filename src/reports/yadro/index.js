const { buildYadroReportHtmlPackage, buildYadroGoalPageHtmlList } = require('./buildYadroReportHtml');
const {
    isYadroTemplateProject,
    isYadroProjectMeta,
    YADRO_PUBLIC_KEY,
    YADRO_SLUG,
} = require('./yadroTemplateProjects');
const { resolveYadroGoalKind } = require('./yadroDataMapper');
const { renderYadroTemplate, listYadroTemplates } = require('./yadroTemplateLoader');

module.exports = {
    buildYadroReportHtmlPackage,
    buildYadroGoalPageHtmlList,
    isYadroTemplateProject,
    isYadroProjectMeta,
    YADRO_PUBLIC_KEY,
    YADRO_SLUG,
    resolveYadroGoalKind,
    renderYadroTemplate,
    listYadroTemplates,
};
