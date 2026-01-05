const calculationService = require('../src/services/CalculationService');
const db = require('../src/config/database');

async function testPriorities() {
    try {
        console.log('Testing Goal Priorities and Waterfall...');

        // Client has 1,000,000 in liquid capital
        const client = {
            id: 1,
            birth_date: '1990-01-01',
            sex: 'male',
            total_liquid_capital: 1000000, // 1M Pool
            assets: []
        };

        const goals = [
            // Order in array shouldn't matter for calculation order, priority should win
            {
                id: 'investment_goal',
                goal_type_id: 3, // INVESTMENT (Priority ~5)
                name: 'My Investment',
                initial_capital: 1000000, // Wants 1M, but should only get remainder
                term_months: 12
            },
            {
                id: 'fin_reserve',
                goal_type_id: 7, // FIN_RESERVE (Priority 1)
                name: 'My Reserve',
                initial_capital: 300000, // Should take 300k
                priority: 1
            },
            {
                id: 'life_insurance_goal',
                goal_type_id: 5, // LIFE (Priority 2)
                name: 'My Life',
                target_amount: 3000000,
                payment_variant: 0, // Single Premium
                // Mocking that NSJ calc will return premium = target for fallback, or close to it.
                // NOTE: If NSJ API fails, fallback sets premium = target_amount.
                // We'll see. The goal is to check deduction.
            }
        ];

        // Inject Mock Portfolio for FinReserve and Investment so they don't fail
        const mockRiskProfiles = [
            {
                profile_type: 'BALANCED',
                instruments: [{ product_id: 1, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' }]
            }
        ];
        const product = await db('products').first();
        mockRiskProfiles[0].instruments.forEach(i => i.product_id = product.id);

        const [portfolioId] = await db('portfolios').insert({
            name: 'TEST_PRIORITY_PORTFOLIO',
            is_active: true,
            classes: JSON.stringify([3, 7]),
            amount_from: 0,
            amount_to: 100000000,
            term_from_months: 0,
            term_to_months: 120,
            risk_profiles: JSON.stringify(mockRiskProfiles)
        });

        try {
            // We need to Mock LifeInsuranceCalculator behavior or ensuring it doesn't fail hard
            // Actually, let's just run it. If NSJ fails, it sets premium = target_amount.
            // If target_amount = 3M, and pool is 1M, Life will take everything if it was Prio 1.
            // But FinReserve is Prio 1.
            // 1. FinReserve takes 300k. Remainder 700k.
            // 2. Life (Prio 2) tries to take 3M. Takes 700k (all remaining).
            // 3. Investment (Prio 5) gets 0.

            const result = await calculationService.calculateFirstRun({ client, goals });

            // Log goals in order of execution (if possible to infer, or just results)
            // The result.goals array preserves input order usually, but let's check values.

            const finRes = result.goals.find(g => g.goal_type === 'FIN_RESERVE');
            const life = result.goals.find(g => g.goal_type === 'LIFE');
            const inv = result.goals.find(g => g.goal_type === 'INVESTMENT');

            console.log('--- Results ---');
            console.log(`Pool Start: ${client.total_liquid_capital}`);
            console.log(`FinReserve (Prio 1) Initial Capital: ${finRes.summary.initial_capital} (Expected 300,000)`);
            console.log(`Life (Prio 2) Initial Capital (Paid Now): ${life.summary.initial_capital} (Expected ~700,000 remaining)`);
            console.log(`Investment (Prio 5) Initial Capital: ${inv.summary.initial_capital} (Expected 0)`);

            if (finRes.summary.initial_capital === 300000 &&
                life.summary.initial_capital === 700000 &&
                inv.summary.initial_capital === 0) {
                console.log('✅ Priorities and Waterfall Logic verified successfully!');
            } else {
                console.error('❌ Priorities logic failed.');
            }

        } finally {
            await db('portfolios').where({ id: portfolioId }).del();
        }

    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        await db.destroy();
    }
}

testPriorities();
