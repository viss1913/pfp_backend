require('dotenv').config();
const db = require('../src/config/database');

(async () => {
    await db('portfolio_classes').where({ id: 8 }).update({ name: 'Рента' });
    await db('portfolios').where({ id: 11 }).update({ name: 'Рента' });
    const row = await db('portfolio_classes').where({ id: 8 }).first();
    console.log('fixed:', row);
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
