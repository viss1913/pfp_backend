const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const reportService = require('./reportService');
const pdfSettingsService = require('./pdfSettingsService');
const { buildReportCoverHtml } = require('../reports/cover/buildCoverHtml');
const { buildReportSummaryOverviewHtml } = require('../reports/summary/buildSummaryOverviewHtml');
const { buildGoalPageHtml } = require('../reports/goalPages/buildGoalPagesHtml');

const SUPPORTED_GOAL_TYPES = ['FIN_RESERVE', 'LIFE', 'INVESTMENT', 'OTHER'];

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

function getDefaultExecutablePath() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN,
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean);

    return candidates.find((p) => fs.existsSync(p)) || null;
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
        const report = await reportService.getClientReportData(clientId, projectId);

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
                buildReportCoverHtml({
                    coverTitle: pdfSettings?.cover_title,
                    titleBandColor: pdfSettings?.title_band_color,
                    coverBackgroundUrl: pdfSettings?.cover_background_url,
                    inlineLocalAssets: true,
                })
            );
        }

        const clientName = report?.client_info?.full_name || '—';
        if (includeSummary) {
            const net = report.current_situation?.net_worth;
            const capitalStr =
                net != null && Number.isFinite(Number(net))
                    ? `${Math.round(Number(net)).toLocaleString('ru-RU')} ₽`
                    : '—';

            pageHtmlList.push(
                buildReportSummaryOverviewHtml({
                    reportPayload: {
                        goals_detailed: report.goals_detailed,
                        overall_plan: report.overall_plan,
                    },
                    clientInfo: {
                        name: clientName,
                        age: report.client_info?.age != null ? String(report.client_info.age) : '—',
                        income: report.client_info?.income_display != null
                            ? String(report.client_info.income_display)
                            : '—',
                        currentCapital: capitalStr,
                    },
                    summaryLogoUrl: pdfSettings?.summary_logo_url || undefined,
                    summaryBackgroundUrl: pdfSettings?.summary_background_url || undefined,
                    summaryChartColor: pdfSettings?.summary_chart_color || undefined,
                    summaryBackgroundDarknessPercent: pdfSettings?.summary_background_darkness_percent,
                    summaryBackgroundOverlayOpacity: pdfSettings?.summary_background_overlay_opacity,
                    summaryTextColor: pdfSettings?.summary_text_color || '#ffffff',
                    summaryLineColor: pdfSettings?.summary_line_color || pdfSettings?.summary_chart_color || '#8b5cf6',
                    inlineLocalAssets: true,
                })
            );
        }

        const goalFilter = normalizeGoalTypes(goalTypes);
        const targetGoalTypes = goalFilter && goalFilter.length > 0 ? goalFilter : SUPPORTED_GOAL_TYPES;

        for (const goalType of targetGoalTypes) {
            const goal = (report.goals_detailed || []).find((g) => g.goal_type === goalType);
            if (!goal) continue;
            pageHtmlList.push(
                buildGoalPageHtml({
                    goalType,
                    goal,
                    clientName,
                    options: {
                        inlineLocalAssets: true,
                        accentColor: pdfSettings?.summary_chart_color || undefined,
                        textColor: pdfSettings?.summary_text_color || '#ffffff',
                        logoSrc: pdfSettings?.summary_logo_url || undefined,
                        backgroundSrc: pdfSettings?.summary_background_url || '',
                        lineColor: pdfSettings?.summary_line_color || pdfSettings?.summary_chart_color || '#8b5cf6',
                        backgroundOverlayOpacity: pdfSettings?.summary_background_overlay_opacity,
                        backgroundDarknessPercent: pdfSettings?.summary_background_darkness_percent,
                    },
                })
            );
        }

        if (pageHtmlList.length === 0) {
            throw new Error('No pages selected for PDF generation');
        }

        const mergedHtml = buildFramesContainerHtml(pageHtmlList);
        const executablePath = getDefaultExecutablePath();
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
            ],
        };

        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }

        const browser = await puppeteer.launch(launchOptions);
        try {
            const page = await browser.newPage();
            const pdfNavTimeoutMs = Math.min(
                Math.max(Number(process.env.REPORT_PDF_NAV_TIMEOUT_MS) || 120000, 15000),
                300000
            );
            page.setDefaultNavigationTimeout(pdfNavTimeoutMs);
            page.setDefaultTimeout(pdfNavTimeoutMs);
            await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
            // load — быстрее networkidle0; вёрстка отчёта с data:-картинками не ждёт сеть
            await page.setContent(mergedHtml, {
                waitUntil: 'load',
                timeout: pdfNavTimeoutMs,
            });
            await new Promise((resolve) => setTimeout(resolve, 450));
            return await page.pdf({
                printBackground: true,
                format: 'A4',
                margin: { top: '0', right: '0', bottom: '0', left: '0' },
                preferCSSPageSize: true,
            });
        } finally {
            await browser.close();
        }
    }
}

module.exports = new ReportPdfService();
