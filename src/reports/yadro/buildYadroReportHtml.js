const { renderYadroTemplate } = require('./yadroTemplateLoader');
const {
    commonContextFromReport,
    coverPlaceholders,
    placeholdersForGoal,
    tailPlaceholders,
} = require('./yadroDataMapper');

const TAIL_PAGES = [
    'tail-01-portfolio.html',
    'tail-02-summary-lumpsum.html',
    'tail-03-summary-monthly.html',
    'tail-04-funds.html',
    'tail-05-alfa-npf.html',
    'tail-06-inflation.html',
    'tail-07-schedule-table.html',
    'tail-08-risk-inflation.html',
    'tail-09-risk-npf-bankruptcy.html',
    'tail-10-risk-ofz-default.html',
    'tail-11-risk-stocks.html',
    'tail-12-risk-bonds.html',
];

/** intro/achieve templates per kind */
const GOAL_TEMPLATES = {
    pension: ['pension-01-intro.html', 'pension-02-state-pension.html', 'pension-03-plan.html'],
    capital: ['capital-01-intro.html', 'capital-02-achieve.html'],
    flat: ['flat-01-intro.html', 'flat-02-achieve.html'],
    passive: ['passive-01-intro.html', 'passive-02-pds-steps.html'],
    child: ['child-01-intro.html', 'child-02-achieve.html'],
    moon: ['moon-01-intro.html', 'moon-02-achieve.html'],
};

const SUPPORTED = ['FIN_RESERVE', 'LIFE', 'PENSION', 'PASSIVE_INCOME', 'RENT', 'INVESTMENT', 'INHERITANCE', 'OTHER'];

function normalizeGoalTypes(goalTypesRaw) {
    if (!goalTypesRaw) return null;
    const items = String(goalTypesRaw)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    return [...new Set(items)].filter((t) => SUPPORTED.includes(t));
}

/**
 * Страницы одной цели (без cover и без tail).
 */
function buildYadroGoalPageHtmlList({ goal, goalIndex = 1, common }) {
    const { kind, values } = placeholdersForGoal(goal, common, goalIndex);
    const files = GOAL_TEMPLATES[kind] || GOAL_TEMPLATES.moon;
    return files.map((file) => renderYadroTemplate(file, values));
}

/**
 * Полный пакет HTML-страниц отчёта YADRO.
 * @returns {{ pageHtmlList: string[], toc: object|null }}
 */
async function buildYadroReportHtmlPackage({
    report,
    includeCover = true,
    includeSummary = true, // reserved; Yadro layout has no separate summary page
    goalTypes = null,
    coverTitle = null,
    clientAvgMonthlyIncome = null,
} = {}) {
    void includeSummary;
    const common = commonContextFromReport(report, {
        coverTitle: coverTitle || undefined,
        clientAvgMonthlyIncome,
        overallPlan: report?.overall_plan || null,
    });
    common.overallPlan = report?.overall_plan || null;

    const filter = normalizeGoalTypes(goalTypes);
    const goals = (report?.goals_detailed || []).filter((g) => {
        const gt = String(g?.goal_type || '').toUpperCase();
        if (!SUPPORTED.includes(gt)) return false;
        if (filter && filter.length && !filter.includes(gt)) return false;
        return true;
    });

    const pageHtmlList = [];
    const tocEntries = [];

    if (includeCover) {
        pageHtmlList.push(renderYadroTemplate('cover.html', coverPlaceholders(common)));
        tocEntries.push({ title: 'Обложка', page: pageHtmlList.length });
    }

    let primaryMetrics = null;
    let primaryTailValues = null;
    let goalOrdinal = 0;
    for (const goal of goals) {
        goalOrdinal += 1;
        const packed = placeholdersForGoal(goal, common, goalOrdinal);
        const kind = packed.kind;
        const files = GOAL_TEMPLATES[kind] || GOAL_TEMPLATES.moon;
        const pages = files.map((file) => renderYadroTemplate(file, packed.values));
        const startPage = pageHtmlList.length + 1;
        pageHtmlList.push(...pages);
        if (!primaryMetrics) {
            primaryMetrics = packed.metrics;
            primaryTailValues = tailPlaceholders(packed.metrics, common, report);
        }
        tocEntries.push({
            title: String(goal?.goal_name || kind),
            goal_type: goal?.goal_type,
            kind,
            page_from: startPage,
            page_to: pageHtmlList.length,
        });
    }

    if (goals.length > 0) {
        const tailValues =
            primaryTailValues ||
            tailPlaceholders(
                primaryMetrics || placeholdersForGoal(goals[0], common, 1).metrics,
                common,
                report
            );
        const tailStart = pageHtmlList.length + 1;
        for (const file of TAIL_PAGES) {
            pageHtmlList.push(renderYadroTemplate(file, tailValues));
        }
        tocEntries.push({
            title: 'Портфель, фонды, риски',
            page_from: tailStart,
            page_to: pageHtmlList.length,
        });
    }

    if (pageHtmlList.length === 0) {
        // cover-only is still valid if includeCover; else empty
        if (includeCover) {
            pageHtmlList.push(renderYadroTemplate('cover.html', coverPlaceholders(common)));
        }
    }

    return {
        pageHtmlList,
        toc: {
            theme: 'yadro',
            entries: tocEntries,
            page_count: pageHtmlList.length,
        },
        reportSchemaVersion: 'yadro-html-v1',
    };
}

module.exports = {
    buildYadroReportHtmlPackage,
    buildYadroGoalPageHtmlList,
    GOAL_TEMPLATES,
    TAIL_PAGES,
};
