const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const reportService = require('../services/reportService');
const pdfSettingsService = require('../services/pdfSettingsService');

const { buildReportSummaryOverviewHtml } = require('../reports/summary/buildSummaryOverviewHtml');
const { buildGoalPageHtml } = require('../reports/goalPages/buildGoalPagesHtml');
const { publicUrlFromKey } = require('../utils/r2Client');

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

function resolveAssetSrc(ref, rootDir, inlineLocalAssets = false) {
    if (ref == null || !String(ref).trim()) return '';
    const s = String(ref).trim();
    if (/^https?:\/\//i.test(s)) return s;

    const abs = path.isAbsolute(s) ? s : path.resolve(rootDir, s);

    if (inlineLocalAssets && fs.existsSync(abs)) {
        try {
            return localFileToDataUrl(abs);
        } catch {
            /* fallthrough */
        }
    }

    // Fallback for stock assets: resolve public URL from R2 by basename.
    const basename = path.basename(abs);
    const r2Key = `pdf-report-summary-stock-assets/${basename}`;
    const pub = publicUrlFromKey(r2Key);
    if (pub) return pub;

    if (fs.existsSync(abs)) return pathToFileURL(abs).href;
    return '';
}

function normalizePageType(pageType) {
    const s = String(pageType || '').trim().toLowerCase();
    if (!s) return '';

    if (s === 'summary' || s === 'portfolio' || s === 'portfolio-overview' || s === 'planoverview') return 'SUMMARY';
    if (s === 'fin_reserve' || s === 'finreserve' || s === 'fin-reserve' || s === 'financial-reserve') return 'FIN_RESERVE';
    if (s === 'life' || s === 'life-protection' || s === 'life-protect') return 'LIFE';
    if (s === 'investment' || s === 'grow-wealth' || s === 'save-and-grow') return 'INVESTMENT';
    if (s === 'other' || s === 'apartment' || s === 'house') return 'OTHER';

    const upper = String(pageType).trim().toUpperCase();
    if (['FIN_RESERVE', 'LIFE', 'INVESTMENT', 'OTHER'].includes(upper)) return upper;
    return '';
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

            const report = await reportService.getClientReportData(clientId, projectId);
            const clientName = report?.client_info?.full_name || '—';

            const pdfSettings = await pdfSettingsService.getByAgentId(agentId, projectId);

            const root = path.join(__dirname, '../../..');
            const backgroundSrc = resolveAssetSrc(pdfSettings?.summary_background_url, root, inlineLocalAssets);
            const logoSrc = resolveAssetSrc(pdfSettings?.summary_logo_url, root, inlineLocalAssets);
            const accentColor = pdfSettings?.summary_chart_color || undefined;
            const aiAvatarSrc = resolveAssetSrc('assets/reports/summary/stock-ai-avatar.png', root, inlineLocalAssets);
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
                    income: '—',
                    currentCapital: capitalStr,
                };

                const html = buildReportSummaryOverviewHtml({
                    reportPayload: {
                        goals_detailed: report.goals_detailed,
                        overall_plan: report.overall_plan,
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

            const html = buildGoalPageHtml({
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
                },
            });

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'private, no-store');
            res.send(html);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[ReportPagesController] getPageHtml:', e);
            res.status(500).json({ error: e.message || 'Failed to build page html' });
        }
    }
}

module.exports = new ReportPagesController();

