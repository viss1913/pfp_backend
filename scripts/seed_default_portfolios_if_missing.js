/**
 * Idempotent: default products (PDS) + default portfolios per portfolio_class.
 * Does NOT delete users/agents/custom products. Safe on Immers after partial AUTO_SEED.
 *
 * Usage: node scripts/seed_default_portfolios_if_missing.js
 */
require('dotenv').config();
const db = require('../src/config/database');

const PORTFOLIO_CLASS_CODES = [
    'PENSION',
    'PASSIVE_INCOME',
    'INVESTMENT',
    'OTHER',
    'LIFE',
    'GOS_PENSION',
    'FIN_RESERVE',
    'RENT',
    'INHERITANCE',
];

function buildRiskProfiles(pdsProductId) {
    const bucket = (productId) => [
        { product_id: productId, share_percent: 100, order_index: 1 },
    ];
    return ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].map((profile_type) => ({
        profile_type,
        potential_yield_percent: 12,
        initial_capital: bucket(pdsProductId),
        top_up: bucket(pdsProductId),
    }));
}

async function ensureDefaultPdsProduct() {
    let row = await db('products').where({ is_default: true, product_type: 'PDS' }).first();
    if (!row) {
        row = await db('products').where({ product_type: 'PDS', agent_id: null }).orderBy('id', 'asc').first();
    }
    if (row) return row.id;

    const [id] = await db('products').insert({
        agent_id: null,
        name: 'ПДС НПФ',
        product_type: 'PDS',
        currency: 'RUB',
        lines: JSON.stringify([
            {
                min_term_months: 0,
                max_term_months: 100,
                min_amount: 0,
                max_amount: 1e18,
                yield_percent: 12,
            },
        ]),
        is_active: true,
        is_default: true,
    });
    console.log('✅ Created default product ПДС НПФ id=', id);
    return typeof id === 'object' ? id.id : id;
}

async function hasDefaultPortfolioForClass(classId) {
    const rows = await db('portfolios')
        .where({ is_default: true, is_active: true, agent_id: null })
        .select('id', 'classes');
    for (const row of rows) {
        let classes = row.classes;
        if (typeof classes === 'string') {
            try {
                classes = JSON.parse(classes);
            } catch {
                classes = [];
            }
        }
        if (Array.isArray(classes) && classes.map(Number).includes(Number(classId))) {
            return true;
        }
    }
    return false;
}

async function run() {
    const pdsProductId = await ensureDefaultPdsProduct();
    let created = 0;

    for (const code of PORTFOLIO_CLASS_CODES) {
        const classRecord = await db('portfolio_classes').where({ code }).first();
        if (!classRecord) {
            console.warn(`⚠️  portfolio_classes missing: ${code}`);
            continue;
        }
        if (await hasDefaultPortfolioForClass(classRecord.id)) {
            console.log(`ℹ️  Default portfolio exists for ${code}`);
            continue;
        }

        const riskProfiles = buildRiskProfiles(pdsProductId);
        await db('portfolios').insert({
            project_id: null,
            agent_id: null,
            name: classRecord.name,
            currency: 'RUB',
            amount_from: 0,
            amount_to: 999999999999999,
            term_from_months: 0,
            term_to_months: 360,
            age_from: null,
            age_to: null,
            investor_type: null,
            gender: null,
            classes: JSON.stringify([classRecord.id]),
            risk_profiles: JSON.stringify(riskProfiles),
            is_active: true,
            is_default: true,
        });
        created += 1;
        console.log(`✅ Created default portfolio: ${code} (class_id=${classRecord.id})`);
    }

    console.log(`\nDone. New portfolios: ${created}`);
}

run()
    .catch((err) => {
        console.error('❌', err);
        process.exitCode = 1;
    })
    .finally(() => db.destroy());
