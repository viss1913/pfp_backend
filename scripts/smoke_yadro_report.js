/**
 * Smoke: собрать HTML-пакет Yadro на мок-данных и проверить отсутствие «живых» {{placeholders}}.
 * Запуск: node scripts/smoke_yadro_report.js
 */
const path = require('path');
const fs = require('fs');
const { buildYadroReportHtmlPackage } = require('../src/reports/yadro/buildYadroReportHtml');
const { listYadroTemplates } = require('../src/reports/yadro/yadroTemplateLoader');
const { isYadroProjectMeta } = require('../src/reports/yadro/yadroTemplateProjects');
const { resolveReportThemeKey } = require('../src/reports/themes/themeResolver');

async function main() {
    const templates = listYadroTemplates();
    console.log('templates:', templates.length, templates.slice(0, 5).join(', '), '...');

    const mockReport = {
        client_info: {
            first_name: 'Иван',
            full_name: 'Иван Тестов',
            avg_monthly_income: 120000,
            age: 40,
        },
        overall_plan: {
            inflation_rate: 5.6,
            avg_monthly_income: 120000,
        },
        goals_detailed: [
            {
                goal_type: 'PENSION',
                goal_name: 'Достойная пенсия',
                summary: {
                    monthly_replenishment: 15000,
                    initial_capital: 100000,
                    inflation_rate: 5.6,
                    target_amount_initial: 80000,
                    target_amount_future: 180000,
                    projected_pension_monthly_present: 22000,
                    projected_pension_monthly_future: 55000,
                    projected_capital_at_retirement: 4500000,
                    accumulation_yield_percent: 10,
                    payout_yield_percent: 6,
                    total_tax_benefit: 120000,
                    total_cofinancing: 180000,
                    deduction_2026: 24000,
                    cofinancing_2026: 36000,
                    years_to_goal: 20,
                    target_months: 240,
                },
                details: {
                    state_pension: {
                        years_to_pension: 20,
                        retirement_year: 2045,
                    },
                    monthly_schedule: [
                        {
                            date: '2026-03-01',
                            replenishment: 100000,
                            tax_deduction: 0,
                            cofinancing: 0,
                            total_capital: 100000,
                            schedule_row_kind: 'INITIAL_LUMP',
                        },
                        {
                            date: '2026-04-01',
                            replenishment: 15000,
                            tax_deduction: 2000,
                            cofinancing: 3000,
                            total_capital: 120500,
                        },
                        {
                            date: '2026-05-01',
                            replenishment: 15000,
                            tax_deduction: 0,
                            cofinancing: 0,
                            total_capital: 136200,
                        },
                    ],
                },
            },
            {
                goal_type: 'OTHER',
                goal_name: 'Квартира в Москве',
                summary: {
                    monthly_replenishment: 25000,
                    initial_capital: 500000,
                    inflation_rate: 5.6,
                    target_amount_future: 12000000,
                    projected_capital: 12500000,
                    accumulation_yield_percent: 9,
                    target_year: 2035,
                    target_months: 108,
                },
                details: { monthly_schedule: [] },
            },
        ],
    };

    const pkg = await buildYadroReportHtmlPackage({
        report: mockReport,
        includeCover: true,
        includeSummary: true,
    });

    console.log('pages:', pkg.pageHtmlList.length);
    console.log('schema:', pkg.reportSchemaVersion);
    console.log('toc entries:', pkg.toc?.entries?.length);

    let leftover = 0;
    const samples = [];
    for (let i = 0; i < pkg.pageHtmlList.length; i += 1) {
        const html = pkg.pageHtmlList[i];
        // плейсхолдеры в HTML-комментариях — документация, не баг
        const bodyOnly = String(html).replace(/<!--[\s\S]*?-->/g, '');
        const matches = bodyOnly.match(/\{\{[a-zA-Z0-9_]+\}\}/g) || [];
        if (matches.length) {
            leftover += matches.length;
            samples.push({ page: i + 1, placeholders: matches.slice(0, 5) });
        }
        // basic size check
        if (html.length < 200) {
            throw new Error(`page ${i + 1} too small`);
        }
        // assets should be inlined as data:
        if (/src=["']assets\//i.test(html)) {
            throw new Error(`page ${i + 1} still has relative assets/ src`);
        }
    }

    if (leftover > 0) {
        console.error('leftover placeholders:', samples);
        process.exitCode = 1;
    } else {
        console.log('OK: no leftover {{placeholders}}, assets inlined');
    }

    const yadroProject = {
        name: 'Yadro',
        slug: 'yadro',
        public_key: 'pk_2a19a53a1c58b4756817f35b',
    };
    console.log('isYadro meta=', isYadroProjectMeta(yadroProject));
    console.log('theme(yadro)=', resolveReportThemeKey(null, yadroProject));
    console.log('theme(22)=', resolveReportThemeKey(22));
    console.log('theme(14)=', resolveReportThemeKey(14));

    const outDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'yadro-smoke-page1.html');
    fs.writeFileSync(outPath, pkg.pageHtmlList[0], 'utf8');
    console.log('wrote', outPath);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
