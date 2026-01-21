const reportService = require('../src/services/reportService');
const knex = require('../src/config/database');

async function reproduceIssue() {
    try {
        const clientId = 8; // User specified client
        console.log(`Generating report for Client ID: ${clientId}...`);

        const report = await reportService.getClientReportData(clientId);

        console.log('--- Report Structure ---');
        console.log('Keys:', Object.keys(report));

        console.log('\n--- Client Profile/Info ---');
        if (report.client_profile) console.log('Found client_profile key (Issue confirmed)');
        if (report.client_info) console.log('Found client_info key (Fix verified)');

        console.log('\n--- Goals Detailed ---');
        console.log('Length:', report.goals_detailed ? report.goals_detailed.length : 'undefined');
        if (report.goals_detailed && report.goals_detailed.length === 0) {
            console.log('Goals array is empty (Issue confirmed if client has goals)');
        }

        console.log('\n--- Waterfall Chart ---');
        console.log(JSON.stringify(report.overall_plan?.chart_waterfall, null, 2));

    } catch (error) {
        console.error('Error generating report:', error);
    } finally {
        await knex.destroy();
    }
}

reproduceIssue();
