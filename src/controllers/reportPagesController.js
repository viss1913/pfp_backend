const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const reportService = require('../services/reportService');
const pdfSettingsService = require('../services/pdfSettingsService');
const clientService = require('../services/clientService');

const { buildReportSummaryOverviewHtml } = require('../reports/summary/buildSummaryOverviewHtml');
const { buildGoalPageHtmlByTheme } = require('../reports/themes/reportRenderers');
const { resolveReportThemeKey } = require('../reports/themes/themeResolver');
const { resolveReportRasterRef } = require('../utils/reportRasterSrc');
const {
    FINAM_PROJECT_ID,
    FINAM_REPO_ROOT,
    resolveGoalTemplateFile,
    buildRepleneshmentPageHtml,
    applyGoalFactsToTemplate,
    fetchAiB2cAvatarUrl,
    applyFinamAiAvatarHtml,
    inlineFinamRasterImages,
} = require('../reports/finam/buildFinamReportHtml');

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
    if (s === 'investment' || s === 'grow-wealth' || s === 'save-and-grow') return 'INVESTMENT';
    if (s === 'other' || s === 'apartment' || s === 'house') return 'OTHER';
    if (s === 'repleneshment' || s === 'replenishment') return 'REPLENESHMENT';
    if (s === 'tax' || s === 'tax-planning') return 'TAX_PLANNING';
    if (s === 'portfolio-final' || s === 'portfolio_final') return 'PORTFOLIO_FINAL';

    const upper = String(pageType).trim().toUpperCase();
    if (['FIN_RESERVE', 'LIFE', 'PENSION', 'PASSIVE_INCOME', 'INVESTMENT', 'OTHER'].includes(upper)) return upper;
    return '';
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
            const isFinamProject = themeKey !== 'rostech' && Number(projectId) === FINAM_PROJECT_ID;

            let finamB2cAvatarUrl = null;
            if (isFinamProject && projectId != null) {
                finamB2cAvatarUrl = await fetchAiB2cAvatarUrl(projectId);
            }

            if (isFinamProject) {
                if (pageType === 'REPLENESHMENT') {
                    const html = inlineFinamRasterImages(buildRepleneshmentPageHtml(report), FINAM_REPO_ROOT);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.setHeader('Cache-Control', 'private, no-store');
                    res.send(html);
                    return;
                }

                if (pageType === 'TAX_PLANNING' || pageType === 'PORTFOLIO_FINAL') {
                    const fileName = pageType === 'TAX_PLANNING' ? 'tax-planning-block-finam.html' : 'portfolio-final-page-finam.html';
                    let html = await fs.promises.readFile(path.join(__dirname, `../reports/finam/${fileName}`), 'utf-8');
                    html = applyFinamAiAvatarHtml(inlineFinamRasterImages(html, FINAM_REPO_ROOT), finamB2cAvatarUrl);
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
                    inlineFinamRasterImages(applyGoalFactsToTemplate(rawHtml, goalForTemplate), FINAM_REPO_ROOT),
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

