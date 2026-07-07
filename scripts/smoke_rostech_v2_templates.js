const {
    buildRostechV2CoverHtml,
    buildRostechV2PensionPagesHtml,
    buildRostechV2InvestmentPagesHtml,
} = require('../src/reports/themes/rostech/v2/rostechV2Composer');
const mock = require('../src/reports/summary/previewMockPayload.json');

async function main() {
    const cover = await buildRostechV2CoverHtml({ coverTitle: 'Персональное финансовое решение' });
    console.log('cover ok', /cover__box/.test(cover), /data:image/.test(cover));

    const goals = mock.goals_detailed || mock.goals || [];
    const pension = goals.find((g) => g.goal_type === 'PENSION');
    if (pension) {
        const pages = await buildRostechV2PensionPagesHtml({
            goal: pension,
            clientName: 'Иван',
            options: { projectId: 6 },
        });
        console.log('pension pages (project 6)', pages.length);
        console.log('pension page1 has title', pages[0].includes('Достойная пенсия'));
        console.log('pension unfilled placeholders', pages.some((p) => /\{\{/.test(p)));
    }

    const invest = goals.find((g) => g.goal_type === 'INVESTMENT');
    if (invest) {
        const pages = await buildRostechV2InvestmentPagesHtml({
            goal: invest,
            clientName: 'Иван',
            options: { clientAge: 45 },
        });
        console.log('invest pages', pages.length);
        console.log('invest page1 has title', pages[0].includes('Сохранить и приумножить'));
        console.log('invest unfilled placeholders', pages.some((p) => /\{\{/.test(p)));
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
