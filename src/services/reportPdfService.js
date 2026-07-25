const reportService = require('./reportService');
const { injectReportPdfEmbeddedFont } = require('../utils/reportPdfFonts');
const { injectReportPdfPageFillA4 } = require('../utils/injectReportPdfPageFillA4');
const { renderHtmlToPdfBuffer } = require('../utils/renderHtmlToPdfBuffer');
const { mergePdfBuffers } = require('../utils/mergePdfBuffers');
const pdfSettingsService = require('./pdfSettingsService');
const agentService = require('./agentService');
const macroService = require('./macroService');
const { buildReportCoverHtml, buildRostechCoverHtml } = require('../reports/cover/buildCoverHtml');
const { buildComonAutofollowPageHtml } = require('../reports/summary/buildSummaryOverviewHtml');
const { buildInflationPageFinamHtml } = require('../reports/finam/buildInflationPageFinamHtml');
const { buildFinamFullPageHtmlList } = require('../reports/finam/buildFinamReportHtml');
const { isFinamTemplateProject } = require('../reports/finam/finamTemplateProjects');
const {
    FINAM_REPORT_VERSION_V2,
    resolveFinamReportVersion,
} = require('../reports/finam/reportVersionResolver');
const { buildFinamReportV2HtmlPackage } = require('../reports/finam_v2/buildFinamReportV2HtmlPackage');
const { buildSummaryOverviewHtmlByTheme, buildGoalPagesHtmlByTheme } = require('../reports/themes/reportRenderers');
const { resolveReportThemeKeyAsync, isRostechReportV2Project } = require('../reports/themes/themeResolver');
const { buildYadroReportHtmlPackage } = require('../reports/yadro/buildYadroReportHtml');
const { injectYadroReportFonts } = require('../utils/yadroReportFonts');
const projectService = require('./projectService');
const { parseProjectSettings, getPartnerLinkTrackingSettings } = require('../utils/projectSettings');
const { applyTrackedPartnerUrlsToHtml } = require('../utils/trackedPartnerUrl');

const SUPPORTED_GOAL_TYPES = ['FIN_RESERVE', 'LIFE', 'PENSION', 'PASSIVE_INCOME', 'RENT', 'INVESTMENT', 'INHERITANCE', 'OTHER'];

function buildAdvisorFromAgent(agent) {
    if (!agent) return null;
    const parts = [agent.last_name, agent.first_name, agent.middle_name]
        .map((part) => (part == null ? '' : String(part).trim()))
        .filter(Boolean);
    return {
        fullName: parts.join(' ') || 'Финансовый консультант',
        email: String(agent.email || agent.email_corp || '').trim(),
        phone: String(agent.phone || '').trim(),
    };
}

async function applyPartnerLinkTrackingToPages(pageHtmlList, { projectId, agentId, brandingAgentId, clientId }) {
    if (!Array.isArray(pageHtmlList) || !pageHtmlList.length || !projectId) {
        return pageHtmlList;
    }
    const project = await projectService.getProjectById(projectId);
    const projectSettings = parseProjectSettings(project?.settings);
    const tracking = getPartnerLinkTrackingSettings(projectSettings);
    if (tracking.enabled !== true) return pageHtmlList;

    const rawId =
        brandingAgentId !== undefined && brandingAgentId !== '' ? brandingAgentId : agentId;
    const id = rawId != null && rawId !== '' ? Number(rawId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return pageHtmlList;

    const agent = await agentService.getAgentById(id, projectId);
    if (!agent) return pageHtmlList;

    const { loadAgentWithParent } = require('./agentPartnerIdWizardService');
    const { agentForPartnerTracking } = require('../utils/effectivePartnerAgent');
    const { parentAgent } = await loadAgentWithParent(id, projectId);

    const linkContext = {
        enabled: true,
        agent: agentForPartnerTracking(agent, parentAgent),
        projectSettings,
        clientId: clientId != null ? Number(clientId) : undefined,
    };
    return pageHtmlList.map((html) => applyTrackedPartnerUrlsToHtml(html, linkContext));
}

async function resolveReportAdvisor({ agentId, brandingAgentId, projectId }) {
    const rawId =
        brandingAgentId !== undefined
            ? brandingAgentId
            : agentId;
    const id = rawId != null && rawId !== '' ? Number(rawId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return null;
    const agent = await agentService.getAgentById(id, projectId);
    return buildAdvisorFromAgent(agent);
}

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

/**
 * Параллельный мап с ограничением — порядок результатов совпадает с `items`.
 * Для PDF: один общий Chromium, несколько вкладок одновременно (быстрее, чем строго по одной).
 */
async function mapWithConcurrency(items, concurrency, mapper) {
    if (!items.length) return [];
    const n = Math.min(Math.max(Number(concurrency) || 1, 1), 32, items.length);
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (true) {
            const i = next;
            next += 1;
            if (i >= items.length) break;
            results[i] = await mapper(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
}

function buildFramesContainerHtml(pageHtmlList, { isFinamV2 = false } = {}) {
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
      width: ${isFinamV2 ? 794 : 595}px;
      height: ${isFinamV2 ? 1123 : 842}px;
      ${isFinamV2 ? '' : 'transform: scale(1.3333333333);'}
      ${isFinamV2 ? '' : 'transform-origin: top left;'}
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
    return await buildInflationPageFinamHtml(await loadFinamInflationMacroData());
}

const FINAM_INFLATION_MACRO_CACHE_TTL_MS = Math.min(
    Math.max(Number(process.env.FINAM_INFLATION_MACRO_CACHE_TTL_MS) || 15 * 60 * 1000, 60_000),
    24 * 60 * 60 * 1000
);
/** @type {{ expiresAt: number, data: object } | null} */
let finamInflationMacroCache = null;

async function loadFinamInflationMacroData() {
    const now = Date.now();
    if (finamInflationMacroCache && finamInflationMacroCache.expiresAt > now) {
        return finamInflationMacroCache.data;
    }

    const to = toIsoDateOnly(new Date());
    const fromYear = new Date();
    fromYear.setFullYear(fromYear.getFullYear() - 1);
    const from = toIsoDateOnly(fromYear);

    const from10y = new Date();
    from10y.setFullYear(from10y.getFullYear() - 10);
    const from10yIso = toIsoDateOnly(from10y);

    const [
        keyRateSeries,
        cpiYoySeries,
        ofz2Series,
        ofz5Series,
        ofz10Series,
        corpIndexSeries,
    ] = await Promise.all([
        // Один горизонт с инфляцией г/г — нужен и v2-графику «ставка + ИПЦ», и карточкам актуальных значений
        loadMacroHistorySafe('cbr_key_rate', from10yIso, to),
        loadMacroHistorySafe('russia_cpi_inflation_yoy', from10yIso, to),
        loadMacroHistorySafe('moex_ofz_gcurve_2y', from, to),
        loadMacroHistorySafe('moex_ofz_gcurve_5y', from, to),
        loadMacroHistorySafe('moex_ofz_gcurve_10y', from, to),
        loadMacroHistorySafe('moex_rucbicp', from, to),
    ]);

    const data = {
        keyRateSeries,
        cpiYoySeries,
        ofz2Series,
        ofz5Series,
        ofz10Series,
        corpIndexSeries,
    };
    finamInflationMacroCache = { expiresAt: now + FINAM_INFLATION_MACRO_CACHE_TTL_MS, data };
    return data;
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
        preloadedReport = null,
    }) {
        const pkg = await this.generateClientReportPdfPackage({
            clientId,
            agentId,
            brandingAgentId,
            projectId,
            includeCover,
            includeSummary,
            goalTypes,
            preloadedReport,
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
        preloadedReport = null,
    }) {
        const htmlPkg = await this.generateClientReportHtmlPackage({
            clientId,
            agentId,
            brandingAgentId,
            projectId,
            includeCover,
            includeSummary,
            goalTypes,
            preloadedReport,
            buildMergedHtml: false,
        });
        // Вариант с iframe/srcdoc заметно раздувает итоговый PDF.
        // Рендерим каждый HTML-лист отдельно и склеиваем готовые PDF-страницы.
        // Последовательный цикл даёт ~N×(навигация+pdf) — на длинных отчётах это ощутимо;
        // параллелим вкладки в одном браузере (лимит через REPORT_PDF_RENDER_CONCURRENCY;
        // для Finam v2 отдельный FINAM_REPORT_V2_RENDER_CONCURRENCY, дефолт 1 из-за тяжёлых шаблонов).
        const list = htmlPkg.pageHtmlList || [];
        const isFinamV2Package = htmlPkg.reportSchemaVersion === 'finam-v2.0';
        const renderConcurrency = Math.min(
            Math.max(
                Number(
                    isFinamV2Package
                        ? process.env.FINAM_REPORT_V2_RENDER_CONCURRENCY
                        : process.env.REPORT_PDF_RENDER_CONCURRENCY
                ) || (isFinamV2Package ? 2 : 4),
                1
            ),
            16
        );
        // Листы Finam v2 уже обёрнуты как A4-холст: 595×842 шаблон
        // масштабируется CSS-трансформом внутри HTML, а не Puppeteer scale.
        const reportPdfScale = (() => {
            if (isFinamV2Package) return 1;
            const n = Number(process.env.REPORT_PDF_SCALE);
            if (Number.isFinite(n) && n > 0) return Math.min(Math.max(n, 0.1), 2);
            return 1;
        })();
        const reportPreferCssPageSize =
            process.env.REPORT_PDF_PREFER_CSS_PAGE_SIZE != null
                ? process.env.REPORT_PDF_PREFER_CSS_PAGE_SIZE !== '0'
                : !isFinamV2Package;
        const pagePdfBuffers = await mapWithConcurrency(list, renderConcurrency, (pageHtml) =>
            renderHtmlToPdfBuffer(pageHtml, {
                pdfScale: reportPdfScale,
                preferCssPageSize: reportPreferCssPageSize,
            })
        );
        const pdfBuffer = await mergePdfBuffers(pagePdfBuffers);
        return {
            pdfBuffer,
            toc: htmlPkg.toc,
            pageHtmlList: htmlPkg.pageHtmlList,
            mergedHtml: htmlPkg.mergedHtml,
            reportSchemaVersion: htmlPkg.reportSchemaVersion || null,
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
        preloadedReport = null,
        buildMergedHtml = true,
    }) {
        const report =
            preloadedReport != null
                ? preloadedReport
                : await reportService.getClientReportData(clientId, projectId);
        const themeKey = await resolveReportThemeKeyAsync(projectId);
        const isYadroProject = themeKey === 'yadro';
        const isFinamProject =
            themeKey !== 'rostech' && themeKey !== 'yadro' && isFinamTemplateProject(projectId);
        const finamReportVersion = await resolveFinamReportVersion({ projectId, themeKey });
        const isFinamReportV2 = isFinamProject && finamReportVersion === FINAM_REPORT_VERSION_V2;

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
        const reportAdvisor = await resolveReportAdvisor({ agentId, brandingAgentId, projectId });

        let pageHtmlList = [];
        let toc = null;
        let reportSchemaVersion = null;

        // YADRO: отдельный пайплайн (своя обложка + goal pages + shared tail).
        // Не используем injectReportPdfPageFillA4 (заточен под article.page) и PdfSubset-шрифт (кракозябры).
        if (isYadroProject) {
            const yadroPkg = await buildYadroReportHtmlPackage({
                report,
                includeCover,
                includeSummary,
                goalTypes,
                coverTitle: pdfSettings?.cover_title || undefined,
                clientAvgMonthlyIncome: report?.client_info?.avg_monthly_income ?? null,
            });
            pageHtmlList = yadroPkg.pageHtmlList || [];
            toc = yadroPkg.toc || null;
            reportSchemaVersion = yadroPkg.reportSchemaVersion || 'yadro-html-v1';

            if (pageHtmlList.length === 0) {
                throw new Error('No pages selected for PDF generation');
            }

            const pageHtmlListForPdf = pageHtmlList.map((h) => injectYadroReportFonts(h));
            const mergedHtml = buildMergedHtml
                ? buildFramesContainerHtml(pageHtmlListForPdf, { isFinamV2: false })
                : null;
            return { mergedHtml, toc, pageHtmlList: pageHtmlListForPdf, reportSchemaVersion };
        }

        if (includeCover && !isFinamReportV2) {
            if (isRostechReportV2Project(projectId)) {
                pageHtmlList.push(
                    await buildRostechCoverHtml({
                        coverTitle: pdfSettings?.cover_title,
                        inlineLocalAssets: true,
                    })
                );
            } else {
                pageHtmlList.push(
                    await buildReportCoverHtml({
                        coverTitle: pdfSettings?.cover_title,
                        titleBandColor: pdfSettings?.title_band_color,
                        coverBackgroundUrl: pdfSettings?.cover_background_url,
                        inlineLocalAssets: true,
                    })
                );
            }
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

        const shouldIncludeComonAutofollowPage = isFinamProject && !isFinamReportV2;
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
            if (isFinamReportV2) {
                const finamV2Pkg = await buildFinamReportV2HtmlPackage({
                    report,
                    includeCover,
                    includeSummary,
                    goalTypes,
                    advisor: reportAdvisor || undefined,
                    macroData: await loadFinamInflationMacroData(),
                    projectId,
                });
                pageHtmlList.push(...finamV2Pkg.pageHtmlList);
                toc = finamV2Pkg.toc;
                reportSchemaVersion = finamV2Pkg.reportSchemaVersion || null;
            } else {
                const inflationPageHtml = await buildFinamInflationPageHtml();
                const finamPages = await buildFinamFullPageHtmlList({
                    report,
                    includeSummary,
                    goalTypes,
                    projectId,
                    inflationPageHtml,
                    // В per-page рендере стабильнее держать dataUrl (иначе часть локальных картинок в Chromium может пропадать).
                    finamRasterRefMode: 'dataUrl',
                });
                pageHtmlList.push(...finamPages);
            }
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
                        projectId,
                        inlineLocalAssets: true,
                        accentColor: pdfSettings?.summary_chart_color || undefined,
                        textColor: pdfSettings?.summary_text_color || '#0f172a',
                        logoSrc: pdfSettings?.summary_logo_url || undefined,
                        backgroundSrc: pdfSettings?.summary_background_url || '',
                        lineColor: pdfSettings?.summary_line_color || pdfSettings?.summary_chart_color || '#5b6cff',
                        backgroundOverlayOpacity: pdfSettings?.summary_background_overlay_opacity,
                        backgroundDarknessPercent: pdfSettings?.summary_background_darkness_percent,
                        overallPlan: report?.overall_plan || null,
                        investmentExpenseGrowthAnnualPercent:
                            report?.overall_plan?.investment_expense_growth_annual_percent ?? null,
                        comonShowcase: report?.comon_showcase || null,
                        clientAvgMonthlyIncome: report?.client_info?.avg_monthly_income ?? null,
                        clientAge: report?.client_info?.age ?? null,
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

        if (isFinamProject) {
            pageHtmlList = await applyPartnerLinkTrackingToPages(pageHtmlList, {
                projectId,
                agentId,
                brandingAgentId,
                clientId,
            });
        }

        if (isRostechPensionOnly) {
            const pensionGoal = (report.goals_detailed || []).find((g) => String(g?.goal_type).toUpperCase() === 'PENSION');
            toc = buildRostechPensionOnlyToc({ hasCover: includeCover, goal: pensionGoal });
        }

        const pageHtmlListWithFonts = isFinamReportV2
            ? pageHtmlList
            : pageHtmlList.map((h) => injectReportPdfEmbeddedFont(h));
        const pageHtmlListForPdf = isFinamReportV2
            ? pageHtmlListWithFonts
            : pageHtmlListWithFonts.map((h) => injectReportPdfPageFillA4(h));
        const mergedHtml = buildMergedHtml
            ? buildFramesContainerHtml(pageHtmlListForPdf, { isFinamV2: isFinamReportV2 })
            : null;
        return { mergedHtml, toc, pageHtmlList: pageHtmlListForPdf, reportSchemaVersion };
    }

}

module.exports = new ReportPdfService();
