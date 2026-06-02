require('dotenv').config({ path: '.env.production' });
const clientService = require('./src/services/clientService');
const projectRepository = require('./src/repositories/projectRepository');
const settings = require('./src/utils/projectComonShowcaseSettings');
const { comonShowcaseService } = require('./src/services/comonShowcaseService');
const { planHasStockInPlan } = require('./src/utils/comonShowcaseGate');
const reportService = require('./src/services/reportService');

(async () => {
    console.log('COMON_SHOWCASE_PROJECT_IDS:', process.env.COMON_SHOWCASE_PROJECT_IDS || '(default 2,14)');
    const project = await projectRepository.findById(2);
    const config = settings.getComonShowcaseConfigFromProject(project);
    console.log('config null?', config === null, config && { enabled: config.enabled, max_items: config.max_items });
    const client = await clientService.getFullClient(12, 2);
    const stored = typeof client.goals_summary === 'string' ? JSON.parse(client.goals_summary) : client.goals_summary;
    const summary = stored?.summary || {};
    console.log('planHasStock:', planHasStockInPlan(summary));
    const showcase = await comonShowcaseService.buildForClient(client, 2, {}, { summary });
    console.log('showcase raw:', showcase === null ? 'NULL' : JSON.stringify({
        skip_reason: showcase.skip_reason,
        error: showcase.error,
        message: showcase.message,
        items: showcase.items?.length,
    }));
    const data = await reportService.getClientReportData(12, 2);
    console.log('in report API:', data.comon_showcase ? JSON.stringify({
        skip: data.comon_showcase.skip_reason,
        items: data.comon_showcase.items?.length,
    }) : 'MISSING');
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
