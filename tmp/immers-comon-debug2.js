require('dotenv').config({ path: '.env.production' });
const clientService = require('./src/services/clientService');
const projectRepository = require('./src/repositories/projectRepository');
const { getComonShowcaseConfigFromProject, parseComonShowcaseProjectIds } = require('./src/utils/projectComonShowcaseSettings');
const { comonShowcaseService } = require('./src/services/comonShowcaseService');
const reportService = require('./src/services/reportService');

(async () => {
    console.log('COMON_SHOWCASE_PROJECT_IDS env:', process.env.COMON_SHOWCASE_PROJECT_IDS || '(default)');
    console.log('parsed ids:', parseComonShowcaseProjectIds());
    const project = await projectRepository.findById(2);
    console.log('project found:', Boolean(project), 'id=', project?.id);
    const config = getComonShowcaseConfigFromProject(project);
    console.log('config:', config ? { enabled: config.enabled, max_items: config.max_items, gate: config.gate_product_types } : null);
    const client = await clientService.getFullClient(12, 2);
    const stored = typeof client.goals_summary === 'string' ? JSON.parse(client.goals_summary) : client.goals_summary;
    const summary = stored?.summary || {};
    const { planHasStockInPlan } = require('./src/utils/comonShowcaseGate');
    console.log('planHasStock:', planHasStockInPlan(summary));
    const showcase = await comonShowcaseService.buildForClient(client, 2, { net_worth: 0, stock_capital_context: {} }, { summary });
    console.log('showcase:', JSON.stringify({
        skip_reason: showcase?.skip_reason,
        error: showcase?.error,
        items: showcase?.items?.length,
    }));
    const data = await reportService.getClientReportData(12, 2);
    console.log('report has comon_showcase key:', 'comon_showcase' in data, 'value items:', data.comon_showcase?.items?.length);
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
