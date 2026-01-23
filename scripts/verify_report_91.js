const knex = require('../src/config/database');
const reportService = require('../src/services/reportService');

async function verifyReport(clientId) {
    try {
        console.log(`--- VERIFYING REPORT FOR CLIENT ${clientId} ---`);
        const report = await reportService.getClientReportData(clientId);

        console.log('\n--- Overall Plan ---');
        console.log('Invested:', report.overall_plan.chart_waterfall.invested_by_client);
        console.log('Total Projected:', report.overall_plan.chart_waterfall.total_projected);

        console.log('\n--- Goals Detailed ---');
        report.goals_detailed.forEach(g => {
            console.log(`\nGoal: ${g.goal_name} (${g.goal_type})`);
            console.log(`- Target Initial: ${g.summary.target_amount_initial}`);
            console.log(`- Target Future: ${g.summary.target_amount_future}`);
            console.log(`- Initial Capital: ${g.summary.initial_capital}`);
            console.log(`- Replenishment: ${g.summary.monthly_replenishment}`);
            console.log(`- Months: ${g.summary.target_months}`);
        });

    } catch (e) {
        console.error('Verification failed:', e);
    } finally {
        await knex.destroy();
        process.exit(0);
    }
}

verifyReport(91);
