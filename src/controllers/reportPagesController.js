const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const reportService = require('../services/reportService');
const pdfSettingsService = require('../services/pdfSettingsService');
const clientService = require('../services/clientService');
const macroService = require('../services/macroService');

const { buildReportSummaryOverviewHtml } = require('../reports/summary/buildSummaryOverviewHtml');
const { buildGoalPageHtmlByTheme } = require('../reports/themes/reportRenderers');
const { resolveReportThemeKey } = require('../reports/themes/themeResolver');
const { resolveReportRasterRef } = require('../utils/reportRasterSrc');
const {
    FINAM_REPO_ROOT,
    resolveGoalTemplateFile,
    buildRepleneshmentPageHtml,
    applyGoalFactsToTemplate,
    fetchAiB2cAvatarUrl,
    applyFinamAiAvatarHtml,
    applyFinamPortfolioFinalAi,
    inlineFinamRasterImages,
} = require('../reports/finam/buildFinamReportHtml');
const { isFinamTemplateProject } = require('../reports/finam/finamTemplateProjects');
const {
    FINAM_REPORT_VERSION_V2,
    resolveFinamReportVersion,
} = require('../reports/finam/reportVersionResolver');
const { buildFinamReportV2PageHtml } = require('../reports/finam_v2/buildFinamReportV2HtmlPackage');
const { applyFinamPortfolioFinalPage, applyFinamTaxPlanningPage } = require('../reports/finam/finamPdfPageAppliers');

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function mimeTypeForLocalFile(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    const map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.ttf': 'font/ttf',
    };
    return map[ext] || 'application/octet-stream';
}

function localFileToDataUrl(absPath) {
    const buf = fs.readFileSync(absPath);
    const mime = mimeTypeForLocalFile(absPath);
    return `data:${mime};base64,${buf.toString('base64')}`;
}

function normalizePageType(pageType) {
    const s = String(pageType || '').trim().toLowerCase();
    if (!s) return '';

    if (s === 'summary' || s === 'portfolio' || s === 'portfolio-overview' || s === 'planoverview') return 'SUMMARY';
    if (s === 'fin_reserve' || s === 'finreserve' || s === 'fin-reserve' || s === 'financial-reserve') return 'FIN_RESERVE';
    if (s === 'life' || s === 'life-protection' || s === 'life-protect') return 'LIFE';
    if (s === 'pension') return 'PENSION';
    if (s === 'passive_income' || s === 'passive-income' || s === 'passiveincome') return 'PASSIVE_INCOME';
    if (s === 'rent') return 'RENT';
    if (s === 'investment' || s === 'grow-wealth' || s === 'save-and-grow') return 'INVESTMENT';
    if (s === 'other' || s === 'apartment' || s === 'house') return 'OTHER';
    if (s === 'repleneshment' || s === 'replenishment') return 'REPLENESHMENT';
    if (s === 'tax' || s === 'tax-planning' || s === 'taxplanning') return 'TAX_PLANNING';
    if (s === 'portfolio-final' || s === 'portfolio_final') return 'PORTFOLIO_FINAL';
    if (s === 'cover') return 'cover';
    if (s === 'intro') return 'intro';
    if (s === 'current-state' || s === 'currentstate') return 'currentState';
    if (s === 'goals') return 'goals';
    if (s === 'executive-summary' || s === 'executivesummary') return 'executiveSummary';
    if (s === 'portfolio-summary' || s === 'portfoliosummary') return 'portfolioSummary';
    if (s === 'comon-autofollow' || s === 'comonautofollow') return 'comonAutofollow';
    if (s === 'idu-strategies' || s === 'idustrategies') return 'iduStrategies';
    if (s === 'finam-offers' || s === 'finamoffers') return 'finamOffers';
    if (s === 'inflation') return 'inflation';
    if (s === 'scenarios') return 'scenarios';
    if (s === 'roadmap') return 'roadmap';
    if (s === 'detailed-plan' || s === 'detailedplan') return 'detailedPlan';
    if (s === 'risk-declaration' || s === 'riskdeclaration') return 'riskDeclaration';
    if (s === 'partner-value' || s === 'partnervalue') return 'partnerValue';
    if (s === 'goal-fin-reserve' || s === 'goalfinreserve') return 'goalFinReserve';
    if (s === 'goal-life' || s === 'goallife') return 'goalLife';
    if (s === 'goal-pension' || s === 'goalpension') return 'goalPension';
    if (s === 'goal-passive-income' || s === 'goalpassiveincome') return 'goalPassiveIncome';
    if (s === 'goal-save-grow' || s === 'goalsavegrow') return 'goalSaveGrow';
    if (s === 'goal-other' || s === 'goalother') return 'goalOther';

    const upper = String(pageType).trim().toUpperCase();
    if (['FIN_RESERVE', 'LIFE', 'PENSION', 'PASSIVE_INCOME', 'RENT', 'INVESTMENT', 'OTHER'].includes(upper)) return upper;
    return '';
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
        console.warn(`[reportPagesController] macro history "${slug}" unavailable:`, err?.message || err);
        return [];
    }
}

async function loadFinamInflationMacroData() {
    const to = toIsoDateOnly(new Date());
    const fromYear = new Date();
    fromYear.setFullYear(fromYear.getFullYear() - 1);
    const from = toIsoDateOnly(fromYear);

    const from10y = new Date();
    from10y.setFullYear(from10y.getFullYear() - 10);
    const from10yIso = toIsoDateOnly(from10y);

    return {
        keyRateSeries: await loadMacroHistorySafe('cbr_key_rate', from, to),
        cpiYoySeries: await loadMacroHistorySafe('russia_cpi_inflation_yoy', from10yIso, to),
        ofz2Series: await loadMacroHistorySafe('moex_ofz_gcurve_2y', from, to),
        ofz5Series: await loadMacroHistorySafe('moex_ofz_gcurve_5y', from, to),
        ofz10Series: await loadMacroHistorySafe('moex_ofz_gcurve_10y', from, to),
        corpIndexSeries: await loadMacroHistorySafe('moex_rucbicp', from, to),
    };
}

async function ensureClientReportAccess({ user, clientId, projectId }) {
    const client = await clientService.getFullClient(clientId, projectId);
    if (!client) {
        const err = new Error('Client not found');
        err.statusCode = 404;
        throw err;
    }

    const role = String(user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'super_admin'].includes(role);
    if (isAdmin) return client;

    if (role === 'client') {
        if (Number(user?.clientId) !== Number(clientId)) {
            const err = new Error('Access denied');
            err.statusCode = 403;
            throw err;
        }
        return client;
    }

    const requesterAgentId = Number(user?.agentId);
    const ownerAgentId = Number(client?.agent_id);
    if (!Number.isFinite(requesterAgentId) || requesterAgentId <= 0 || requesterAgentId !== ownerAgentId) {
        const err = new Error('Access denied');
        err.statusCode = 403;
        throw err;
    }

    return client;
}

class ReportPagesController {
    /**
     * GET /api/pfp/reports/:clientId/pages/:pageType/html
     * pageType: SUMMARY | FIN_RESERVE | LIFE | INVESTMENT | OTHER
     */
    async getPageHtml(req, res) {
        try {
            const agentId = req.user.agentId;
            const clientId = Number(req.params.clientId);
            const rawPageType = req.params.pageType;
            const pageType = normalizePageType(rawPageType);

            const projectId = req.projectId ?? req.user.projectId ?? null;
            const inlineLocalAssets = req.query.inline === '1' || req.query.inline === 'true';

            if (!clientId || Number.isNaN(clientId)) {
                res.status(400).json({ error: 'Invalid clientId' });
                return;
            }
            if (!pageType) {
                res.status(400).json({ error: 'Unknown pageType' });
                return;
            }

            await ensureClientReportAccess({ user: req.user, clientId, projectId });
            const report = await reportService.getClientReportData(clientId, projectId);
            const clientName = report?.client_info?.first_name || report?.client_info?.full_name || '—';
            const themeKey = resolveReportThemeKey(projectId);
            const isFinamProject = themeKey !== 'rostech' && isFinamTemplateProject(projectId);
            const finamReportVersion = await resolveFinamReportVersion({ projectId, themeKey });

            if (isFinamProject && finamReportVersion === FINAM_REPORT_VERSION_V2) {
                const macroData = pageType === 'inflation' ? await loadFinamInflationMacroData() : null;
                const html = await buildFinamReportV2PageHtml({
                    report,
                    pageType: rawPageType || pageType,
                    goalId: req.query.goalId ? Number(req.query.goalId) : null,
                    goalTypes: req.query.goalTypes || null,
                    macroData,
                });
                if (!html) {
                    res.status(404).json({ error: `No Finam v2 page for pageType ${pageType}` });
                    return;
                }
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'private, no-store');
                res.send(html);
                return;
            }

            let finamB2cAvatarUrl = null;
            if (isFinamProject && projectId != null) {
                finamB2cAvatarUrl = await fetchAiB2cAvatarUrl(projectId);
            }

            if (isFinamProject) {
                if (pageType === 'REPLENESHMENT') {
                    const html = await inlineFinamRasterImages(buildRepleneshmentPageHtml(report), FINAM_REPO_ROOT);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.setHeader('Cache-Control', 'private, no-store');
                    res.send(html);
                    return;
                }

                if (pageType === 'TAX_PLANNING' || pageType === 'PORTFOLIO_FINAL') {
                    const fileName = pageType === 'TAX_PLANNING' ? 'tax-planning-block-finam.html' : 'portfolio-final-page-finam.html';
                    let html = await fs.promises.readFile(path.join(__dirname, `../reports/finam/${fileName}`), 'utf-8');
                    if (pageType === 'TAX_PLANNING') {
                        html = applyFinamTaxPlanningPage(html, report);
                    } else {
                        html = applyFinamPortfolioFinalPage(html, report);
                        html = await applyFinamPortfolioFinalAi(html, report, projectId);
                    }
                    html = applyFinamAiAvatarHtml(await inlineFinamRasterImages(html, FINAM_REPO_ROOT), finamB2cAvatarUrl);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.setHeader('Cache-Control', 'private, no-store');
                    res.send(html);
                    return;
                }
            }

            const pdfSettings = await pdfSettingsService.getByAgentId(agentId, projectId);

            const root = path.join(__dirname, '../../..');
            const backgroundSrc = await resolveReportRasterRef(
                pdfSettings?.summary_background_url,
                root,
                root,
                inlineLocalAssets
            );
            const logoSrc = await resolveReportRasterRef(pdfSettings?.summary_logo_url, root, root, inlineLocalAssets);
            const accentColor = pdfSettings?.summary_chart_color || undefined;
            const aiAvatarSrc = await resolveReportRasterRef(
                'assets/reports/summary/stock-ai-avatar.png',
                root,
                root,
                inlineLocalAssets
            );
            const textColor = pdfSettings?.summary_text_color || '#ffffff';
            const lineColor = pdfSettings?.summary_line_color || accentColor || '#8b5cf6';
            const backgroundOverlayOpacity = pdfSettings?.summary_background_overlay_opacity;
            const backgroundDarknessPercent = pdfSettings?.summary_background_darkness_percent;

            if (pageType === 'SUMMARY') {
                // Сводная уже есть в виде buildReportSummaryOverviewHtml, но нам надо включить inlineLocalAssets для preview
                const net = report.current_situation?.net_worth;
                const capitalStr =
                    net != null && Number.isFinite(Number(net))
                        ? `${Math.round(Number(net)).toLocaleString('ru-RU')} ₽`
                        : '—';
                const clientInfo = {
                    name: clientName,
                    age: report.client_info?.age != null ? String(report.client_info.age) : '—',
                    income: report.client_info?.income_display != null
                        ? String(report.client_info.income_display)
                        : '—',
                    currentCapital: capitalStr,
                };

                const html = await buildReportSummaryOverviewHtml({
                    reportPayload: {
                        goals_detailed: report.goals_detailed,
                        overall_plan: report.overall_plan,
                        ...(report.comon_showcase ? { comon_showcase: report.comon_showcase } : {}),
                    },
                    clientInfo,
                    summaryLogoUrl: pdfSettings?.summary_logo_url || undefined,
                    summaryBackgroundUrl: pdfSettings?.summary_background_url || undefined,
                    summaryChartColor: accentColor,
                    summaryBackgroundDarknessPercent: backgroundDarknessPercent,
                    summaryBackgroundOverlayOpacity: backgroundOverlayOpacity,
                    summaryTextColor: textColor,
                    summaryLineColor: lineColor,
                    inlineLocalAssets,
                });

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'private, no-store');
                res.send(html);
                return;
            }

            const goalTypeToFind = pageType;
            const goal = (report.goals_detailed || []).find((g) => g.goal_type === goalTypeToFind);
            if (!goal) {
                res.status(404).json({ error: `Goal for pageType ${pageType} not found` });
                return;
            }

            let html;
            if (isFinamProject) {
                const goalFromQueryId = req.query.goalId ? Number(req.query.goalId) : null;
                const goalForTemplate =
                    (Number.isFinite(goalFromQueryId) &&
                        (report.goals_detailed || []).find((g) => Number(g?.goal_id) === goalFromQueryId)) ||
                    goal;
                const fileName = resolveGoalTemplateFile(goalForTemplate);
                if (!fileName) {
                    res.status(404).json({ error: `No Finam template for pageType ${pageType}` });
                    return;
                }
                const rawHtml = await fs.promises.readFile(path.join(__dirname, `../reports/finam/${fileName}`), 'utf-8');
                html = applyFinamAiAvatarHtml(
                    await inlineFinamRasterImages(applyGoalFactsToTemplate(rawHtml, goalForTemplate), FINAM_REPO_ROOT),
                    finamB2cAvatarUrl
                );
            } else {
                html = await buildGoalPageHtmlByTheme({
                    themeKey,
                    goalType: pageType,
                    goal,
                    clientName,
                    options: {
                        inlineLocalAssets,
                        accentColor,
                        textColor,
                        logoSrc: logoSrc || undefined,
                        backgroundSrc: backgroundSrc || '',
                        aiAvatarSrc: aiAvatarSrc || undefined,
                        lineColor,
                        backgroundOverlayOpacity,
                        backgroundDarknessPercent,
                        clientAvgMonthlyIncome: report?.client_info?.avg_monthly_income ?? null,
                        overallPlan: report?.overall_plan || null,
                        reportGoalsOrdered: report?.goals_detailed || [],
                    },
                });
            }

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(html);
        } catch (e) {
            if (e?.statusCode) {
                res.status(e.statusCode).json({ error: e.message });
                return;
            }
            // eslint-disable-next-line no-console
            console.error('[ReportPagesController] getPageHtml:', e);
            res.status(500).json({ error: e.message || 'Failed to build page html' });
        }
    }
}

module.exports = new ReportPagesController();

