const {
    buildReportCoverHtml,
    buildRostechCoverHtml,
    GLOBAL_DEFAULTS,
    formatCoverDateRu,
} = require('../cover/buildCoverHtml');

/** @deprecated используй GLOBAL_DEFAULTS из ../cover */
const DEFAULTS = {
    title: GLOBAL_DEFAULTS.coverTitle,
    dateLine: formatCoverDateRu(),
};

module.exports = {
    buildReportCoverHtml,
    buildRostechCoverHtml,
    GLOBAL_DEFAULTS,
    DEFAULTS,
    formatCoverDateRu,
};
