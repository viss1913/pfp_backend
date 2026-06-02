require('dotenv').config({ path: '.env.production' });
const reportService = require('./src/services/reportService');

(async () => {
    const data = await reportService.getClientReportData(12, 2);
    const cs = data.comon_showcase;
    console.log(JSON.stringify({
        has_comon: Boolean(cs),
        skip_reason: cs?.skip_reason,
        error: cs?.error,
        items_count: Array.isArray(cs?.items) ? cs.items.length : 0,
        first_items: (cs?.items || []).slice(0, 3).map((i) => ({ id: i.id, name: i.name, min_sum: i.min_sum })),
    }, null, 2));
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
