/**
 * Сценарий: мужчина 45 лет, доход 200k, цель INVESTMENT (Ростех project 22).
 * Реальный расчёт calculateFirstRun + PDF как в reportPdfService (invest-only, без сводной).
 * Важно: клиент в БД не создаётся — в списке CRM его не будет, только локальный PDF/JSON в tmp/.
 *
 * Usage: node scripts/test_rostech_investment_scenario.js
 */
const fs = require('fs');
const path = require('path');

const knex = require('../src/config/database');
const calculationService = require('../src/services/calculationService');
const pdfSettingsService = require('../src/services/pdfSettingsService');
const reportPdfService = require('../src/services/reportPdfService');
const { buildReportCoverHtml } = require('../src/reports/cover/buildCoverHtml');
const { buildGoalPagesHtmlByTheme } = require('../src/reports/themes/reportRenderers');

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
      width: 794px;
      height: 1123px;
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

const ROSTECH_PROJECT_ID = 22;

async function main() {
    // Возраст ~45 на дату прогона (2026)
    const client = {
        project_id: ROSTECH_PROJECT_ID,
        first_name: 'Александр',
        sex: 'male',
        birth_date: '1981-01-15',
        avg_monthly_income: 200000,
        total_liquid_capital: 100000,
    };

    const goals = [
        {
            id: 91001,
            goal_type_id: 3,
            name: 'Сохранить и приумножить',
            initial_capital: 100000,
            monthly_replenishment: 5000,
            term_months: 180,
            risk_profile: 'conservative',
        },
    ];

    console.log('Расчёт calculateFirstRun (Ростех, одна цель INVESTMENT)...');
    console.log('(Запись clients не делаем — тестовый Александр в ЛК не появится.)\n');
    const calc = await calculationService.calculateFirstRun({ client, goals }, null, null, {
        isFirstRun: true,
        usePool: true,
    });

    const inv = (calc.goals || []).find((g) => String(g.goal_type).toUpperCase() === 'INVESTMENT');
    if (!inv || inv.error) {
        console.error('Нет результата INVESTMENT:', inv);
        process.exit(1);
    }

    const s = inv.summary || {};
    console.log('Итог расчёта INVESTMENT:', {
        projected_capital_at_end: s.projected_capital_at_end,
        total_tax_benefit: s.total_tax_benefit,
        total_cofinancing: s.total_cofinancing,
        accumulation_yield_percent: s.accumulation_yield_percent,
        initial_capital: s.initial_capital,
        monthly_replenishment: s.monthly_replenishment,
        target_months: s.target_months,
        schedule_rows: Array.isArray(inv.details?.monthly_schedule) ? inv.details.monthly_schedule.length : 0,
    });

    const pdfSettings = pdfSettingsService.getDefaultsMerged();
    const clientName = 'Александр';

    const overallPlan = {
        chart_waterfall: {},
        tax_benefits: { totals: (calc.summary && calc.summary.tax_benefits_summary && calc.summary.tax_benefits_summary.totals) || {} },
    };

    const pageHtmlList = [];
    pageHtmlList.push(
        await buildReportCoverHtml({
            coverTitle: pdfSettings?.cover_title,
            titleBandColor: pdfSettings?.title_band_color,
            coverBackgroundUrl: pdfSettings?.cover_background_url,
            inlineLocalAssets: true,
        })
    );

    const goalPages = await buildGoalPagesHtmlByTheme({
        themeKey: 'rostech',
        goalType: 'INVESTMENT',
        goal: inv,
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
            overallPlan,
            clientAvgMonthlyIncome: client.avg_monthly_income,
        },
    });
    pageHtmlList.push(...(goalPages || []).filter((x) => typeof x === 'string' && x.trim()));

    const merged = buildFramesContainerHtml(pageHtmlList);
    const pdfBuffer = await reportPdfService._renderPdfFromMergedHtml(merged);

    const outDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const pdfPath = path.join(outDir, 'rostech-investment-alexandr-scenario.pdf');
    const jsonPath = path.join(outDir, 'rostech-investment-alexandr-calc.json');

    fs.writeFileSync(pdfPath, pdfBuffer);
    fs.writeFileSync(jsonPath, JSON.stringify({ client, goals_input: goals, calculation: calc }, null, 2), 'utf8');

    console.log('PDF:', pdfPath, 'байт:', pdfBuffer.length);
    console.log('JSON расчёта:', jsonPath);
    await knex.destroy();
}

main().catch(async (e) => {
    console.error(e);
    try {
        await knex.destroy();
    } catch (_) {}
    process.exit(1);
});
