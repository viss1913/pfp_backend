require('dotenv').config();
const db = require('./src/config/database');
(async () => {
    const row = await db('clients').where({ id: 2 }).select('goals_summary').first();
    const gs = typeof row.goals_summary === 'string' ? JSON.parse(row.goals_summary) : row.goals_summary;
    const goals = gs?.goals || gs?.calculation?.goals || gs;
    const list = Array.isArray(goals) ? goals : Object.values(goals || {});
    for (const g of list) {
        const t = g.goal_type_id || g.type_id || g.type;
        if (t === 1 || t === 'PENSION' || (g.name && /пенс/i.test(g.name))) {
            console.log('PENSION goal:', JSON.stringify({
                name: g.name,
                error: g.error,
                status: g.status,
                target: g.target_amount,
                keys: Object.keys(g).slice(0, 15),
            }, null, 2));
        }
    }
    await db.destroy();
})();
