const reportService = require('./reportService');
const { injectReportPdfEmbeddedFont } = require('../utils/reportPdfFonts');
const { renderHtmlToPdfBuffer } = require('../utils/renderHtmlToPdfBuffer');
const pdfSettingsService = require('./pdfSettingsService');
const macroService = require('./macroService');
const { buildReportCoverHtml } = require('../reports/cover/buildCoverHtml');
const { buildComonAutofollowPageHtml } = require('../reports/summary/buildSummaryOverviewHtml');
const { buildInflationPageFinamHtml } = require('../reports/finam/buildInflationPageFinamHtml');
const { buildFinamFullPageHtmlList } = require('../reports/finam/buildFinamReportHtml');
const { isFinamTemplateProject } = require('../reports/finam/finamTemplateProjects');
const { buildSummaryOverviewHtmlByTheme, buildGoalPagesHtmlByTheme } = require('../reports/themes/reportRenderers');
const { resolveReportThemeKey } = require('../reports/themes/themeResolver');

const SUPPORTED_GOAL_TYPES = ['FIN_RESERVE', 'LIFE', 'PENSION', 'INVESTMENT', 'OTHER'];

function normalizeGoalTypes(goalTypesRaw) {
    if (!goalTypesRaw) return null;
    const items = String(goalTypesRaw)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    const unique = [...new Set(items)];
    return unique.filter((t) => SUPPORTED_GOAL_TYPES.includes(t));
}

function escapeAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildFramesContainerHtml(pageHtmlList) {
    const frames = pageHtmlList
        .map((html, idx) => {
            const srcDoc = escapeAttr(html);
            const isLast = idx === pageHtmlList.length - 1;
            return `<section class="pdf-page${isLast ? ' pdf-page--last' : ''}">
  <iframe srcdoc="${srcDoc}" loading="eager"></iframe>
</section>`;
        })
        .join('\n');

    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .pdf-page {
      width: 794px;   /* A4 width in CSS px @96dpi */
      height: 1123px; /* A4 height in CSS px @96dpi */
      margin: 0 auto;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      background: #fff;
    }
    .pdf-page--last {
      page-break-after: auto;
      break-after: auto;
    }
    .pdf-page > iframe {
      width: 595px;
      height: 842px;
      transform: scale(1.3333333333);
      transform-origin: top left;
      border: 0;
      display: block;
    }
  </style>
</head>
<body>
${frames}
</body>
</html>`;
}

function estimateScheduleChunks(goal) {
    const scheduleRows = Array.isArray(goal?.details?.monthly_schedule)
        ? goal.details.monthly_schedule.filter((row) => row && row.date).length
        : 0;
    if (!scheduleRows) return 1;
    const firstPageRows = 22;
    const nextPageRows = 28;
    if (scheduleRows <= firstPageRows) return 1;
    return 1 + Math.ceil((scheduleRows - firstPageRows) / nextPageRows);
}

function toIsoDateOnly(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

async function loadMacroHistorySafe(slug, from, to) {
    try {
        const rows = await macroService.getHistory(slug, from, to);
        return Array.isArray(rows) ? rows : [];
    } catch (err) {
        console.warn(`[reportPdfService] macro history "${slug}" unavailable:`, err?.message || err);
        return [];
    }
}

async function buildFinamInflationPageHtml() {
    const to = toIsoDateOnly(new Date());
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1);
    const from = toIsoDateOnly(fromDate);

    return await buildInflationPageFinamHtml({
        inflationSeries: await loadMacroHistorySafe('cbr_inflation_annual', from, to),
        keyRateSeries: await loadMacroHistorySafe('cbr_key_rate', from, to),
        ofz2Series: await loadMacroHistorySafe('moex_ofz_gcurve_2y', from, to),
        ofz5Series: await loadMacroHistorySafe('moex_ofz_gcurve_5y', from, to),
        ofz10Series: await loadMacroHistorySafe('moex_ofz_gcurve_10y', from, to),
        corpIndexSeries: await loadMacroHistorySafe('moex_rucbicp', from, to),
    });
}

function buildRostechPensionOnlyToc({ hasCover, goal }) {
    let page = hasCover ? 2 : 1;
    const schedulePageCount = estimateScheduleChunks(goal);
    const toc = [
        { id: 'financial_plan_intro', title: 'Ваш финансовый план', order: 1, page_start: page++, page_count: 1 },
        { id: 'state_pension_forecast', title: 'Прогноз Госпенсии', order: 2, page_start: page++, page_count: 1 },
        { id: 'proposed_plan', title: 'Предлагаемый план', order: 3, page_start: page++, page_count: 1 },
        { id: 'portfolio_structure', title: 'Структура портфеля НПФ', order: 4, page_start: page++, page_count: 1 },
        { id: 'state_pension_methodology', title: 'Методика расчета Госпенсии', order: 5, page_start: page++, page_count: 2 },
        { id: 'inflation_info', title: 'Важная информация. Инфляция', order: 6, page_start: page + 2, page_count: 1 },
        { id: 'risk_declaration', title: 'Декларация о рисках', order: 7, page_start: page + 3, page_count: 5 },
        {
            id: 'goal_progress_schedule',
            title: 'График достижения целей',
            order: 8,
            page_start: page + 8,
            page_count: schedulePageCount,
        },
    ];
    return toc;
}

class ReportPdfService {
    /**
     * @param {object} opts
     * @param {number} opts.clientId
     * @param {number} [opts.agentId] — для pdf-settings из JWT агента (если не передан brandingAgentId)
     * @param {number|null|undefined} [opts.brandingAgentId] — если задан (в т.ч. null): брендинг с этого агента или дефолты; если undefined — как раньше, через agentId
     */
    async generateClientReportPdf({
        clientId,
        agentId,
        brandingAgentId,
        projectId = null,
        includeCover = true,
        includeSummary = true,
        goalTypes = null,
    }) {
        const pkg = await this.generateClientReportPdfPackage({
            clientId,
            agentId,
            brandingAgentId,
            projectId,
            includeCover,
            includeSummary,
            goalTypes,
        });
        return pkg.pdfBuffer;
    }

    async generateClientReportPdfPackage({
        clientId,
        agentId,
        brandingAgentId,
        projectId = null,
        includeCover = true,
        includeSummary = true,
        goalTypes = null,
    }) {
        const htmlPkg = await this.generateClientReportHtmlPackage({
            clientId,
            agentId,
            brandingAgentId,
            projectId,
            includeCover,
            includeSummary,
            goalTypes,
        });
        const pdfBuffer = await renderHtmlToPdfBuffer(htmlPkg.mergedHtml);
        return {
            pdfBuffer,
            toc: htmlPkg.toc,
            pageHtmlList: htmlPkg.pageHtmlList,
            mergedHtml: htmlPkg.mergedHtml,
        };
    }

    async generateClientReportHtmlPackage({
        clientId,
        agentId,
        brandingAgentId,
        projectId = null,
        includeCover = true,
        includeSummary = true,
        goalTypes = null,
    }) {
        const report = await reportService.getClientReportData(clientId, projectId);
        const themeKey = resolveReportThemeKey(projectId);
        const isFinamProject = themeKey !== 'rostech' && isFinamTemplateProject(projectId);

        let pdfSettings;
        if (brandingAgentId !== undefined) {
            const bid =
                brandingAgentId != null && brandingAgentId !== ''
                    ? Number(brandingAgentId)
                    : NaN;
            if (Number.isFinite(bid) && bid > 0) {
                pdfSettings = await pdfSettingsService.getByAgentId(bid, projectId);
            } else {
                pdfSettings = pdfSettingsService.getDefaultsMerged();
            }
        } else {
            pdfSettings = await pdfSettingsService.getByAgentId(agentId, projectId);
        }

        const pageHtmlList = [];
        if (includeCover) {
            pageHtmlList.push(
                await buildReportCoverHtml({
                    coverTitle: pdfSettings?.cover_title,
                    titleBandColor: pdfSettings?.title_band_color,
                    coverBackgroundUrl: pdfSettings?.cover_background_url,
                    inlineLocalAssets: true,
                })
            );
        }

        const clientName = report?.client_info?.first_name || report?.client_info?.full_name || '—';
        const goalFilter = normalizeGoalTypes(goalTypes);
        const targetGoalTypes = goalFilter && goalFilter.length > 0 ? goalFilter : SUPPORTED_GOAL_TYPES;
        const reportGoalTypes = new Set(
            (report.goals_detailed || [])
                .map((g) => String(g?.goal_type || '').toUpperCase())
                .filter(Boolean)
        );
        const isRostechPensionOnly =
            themeKey === 'rostech' &&
            reportGoalTypes.size === 1 &&
            reportGoalTypes.has('PENSION');
        const isRostechInvestmentOnly =
            themeKey === 'rostech' &&
            reportGoalTypes.size === 1 &&
            reportGoalTypes.has('INVESTMENT');
        const isRostechOtherOnly =
            themeKey === 'rostech' &&
            reportGoalTypes.size === 1 &&
            reportGoalTypes.has('OTHER');

        if (includeSummary && !isFinamProject && !isRostechPensionOnly && !isRostechInvestmentOnly && !isRostechOtherOnly) {
            const net = report.current_situation?.net_worth;
            const capitalStr =
                net != null && Number.isFinite(Number(net))
                    ? `${Math.round(Number(net)).toLocaleString('ru-RU')} ₽`
                    : '—';
            pageHtmlList.push(
                await buildSummaryOverviewHtmlByTheme({
                    themeKey,
                    reportPayload: {
                        goals_detailed: report.goals_detailed,
                        overall_plan: report.overall_plan,
                        ...(report.comon_showcase ? { comon_showcase: report.comon_showcase } : {}),
                    },
                    clientInfo: {
                        name: clientName,
                        age: report.client_info?.age != null ? String(report.client_info.age) : '—',
                        income: report.client_info?.income_display != null ? String(report.client_info.income_display) : '—',
                        currentCapital: capitalStr,
                    },
                    summaryLogoUrl: pdfSettings?.summary_logo_url || undefined,
                    summaryBackgroundUrl: pdfSettings?.summary_background_url || undefined,
                    summaryChartColor: pdfSettings?.summary_chart_color || undefined,
                    summaryBackgroundDarknessPercent: pdfSettings?.summary_background_darkness_percent,
                    summaryBackgroundOverlayOpacity: pdfSettings?.summary_background_overlay_opacity,
                    summaryTextColor: pdfSettings?.summary_text_color || '#0f172a',
                    summaryLineColor: pdfSettings?.summary_line_color || pdfSettings?.summary_chart_color || '#5b6cff',
                    inlineLocalAssets: true,
                    renderMode: 'overview',
                })
            );
        }

        const shouldIncludeComonAutofollowPage = isFinamProject;
        const comonAutofollowPageHtml = shouldIncludeComonAutofollowPage
            ? await buildComonAutofollowPageHtml({
                reportPayload: {
                    ...(report.comon_showcase ? { comon_showcase: report.comon_showcase } : {}),
                },
                summaryChartColor: pdfSettings?.summary_chart_color || undefined,
                summaryTextColor: pdfSettings?.summary_text_color || '#0f172a',
                summaryLineColor: pdfSettings?.summary_line_color || pdfSettings?.summary_chart_color || '#5b6cff',
                summaryBackgroundOverlayOpacity: pdfSettings?.summary_background_overlay_opacity,
                inlineLocalAssets: true,
            })
            : null;

        if (isFinamProject) {
            const inflationPageHtml = await buildFinamInflationPageHtml();
            const finamPages = await buildFinamFullPageHtmlList({
                report,
                includeSummary,
                goalTypes,
                projectId,
                inflationPageHtml,
            });
            pageHtmlList.push(...finamPages);
        } else {
            for (const goalType of targetGoalTypes) {
                const goal = (report.goals_detailed || []).find((g) => g.goal_type === goalType);
                if (!goal) continue;
                const pageHtmls = await buildGoalPagesHtmlByTheme({
                    themeKey,
                    goalType,
                    goal,
                    clientName,
                    options: {
                        inlineLocalAssets: true,
                        accentColor: pdfSettings?.summary_chart_color || undefined,
                        textColor: pdfSettings?.summary_text_color || '#0f172a',
                        logoSrc: pdfSettings?.summary_logo_url || undefined,
                        backgroundSrc: pdfSettings?.summary_background_url || '',
                        lineColor: pdfSettings?.summary_line_color || pdfSettings?.summary_chart_color || '#5b6cff',
                        backgroundOverlayOpacity: pdfSettings?.summary_background_overlay_opacity,
                        backgroundDarknessPercent: pdfSettings?.summary_background_darkness_percent,
                        overallPlan: report?.overall_plan || null,
                        comonShowcase: report?.comon_showcase || null,
                        clientAvgMonthlyIncome: report?.client_info?.avg_monthly_income ?? null,
                        reportGoalsOrdered: report?.goals_detailed || [],
                    },
                });
                if (Array.isArray(pageHtmls) && pageHtmls.length > 0) {
                    pageHtmlList.push(...pageHtmls.filter((x) => typeof x === 'string' && x.trim()));
                }
            }
        }

        if (!isFinamProject && comonAutofollowPageHtml) {
            // Place Comon page before inflation page when present; otherwise right after summary.
            const inflationIdx = pageHtmlList.findIndex((html) => /инфляц/i.test(String(html)));
            if (inflationIdx >= 0) {
                pageHtmlList.splice(inflationIdx, 0, comonAutofollowPageHtml);
            } else {
                const afterSummaryIndex =
                    (includeCover ? 1 : 0) +
                    (includeSummary && !isRostechPensionOnly && !isRostechInvestmentOnly && !isRostechOtherOnly ? 1 : 0);
                pageHtmlList.splice(Math.min(afterSummaryIndex, pageHtmlList.length), 0, comonAutofollowPageHtml);
            }
        }

        if (pageHtmlList.length === 0) {
            throw new Error('No pages selected for PDF generation');
        }

        let toc = null;
        if (isRostechPensionOnly) {
            const pensionGoal = (report.goals_detailed || []).find((g) => String(g?.goal_type).toUpperCase() === 'PENSION');
            toc = buildRostechPensionOnlyToc({ hasCover: includeCover, goal: pensionGoal });
        }

        const pageHtmlListForPdf = pageHtmlList.map((h) => injectReportPdfEmbeddedFont(h));
        const mergedHtml = buildFramesContainerHtml(pageHtmlListForPdf);
        return { mergedHtml, toc, pageHtmlList: pageHtmlListForPdf };
    }

}

module.exports = new ReportPdfService();
