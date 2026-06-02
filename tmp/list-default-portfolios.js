require('dotenv').config();
const db = require('../src/config/database');

(async () => {
    const classes = await db('portfolio_classes').select('id', 'code', 'name').orderBy('id');
    console.log('=== portfolio_classes ===');
    console.table(classes);

    const defaults = await db('portfolios')
        .where({ is_active: 1, is_default: 1 })
        .select('id', 'name', 'classes', 'agent_id', 'project_id', 'term_to_months')
        .orderBy('id');
    console.log('\n=== default portfolios ===');
    console.table(defaults);

    const agentCount = await db('portfolios')
        .where({ is_active: 1 })
        .whereNotNull('agent_id')
        .count('* as c');
    console.log('\nagent-owned active portfolios:', agentCount[0].c);
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
