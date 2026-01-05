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
                goal_type_id: 3, // INVESTMENT (Priority 4/5)
                name: 'My Investment (Machine)',
                target_amount: 3000000,
                term_months: 12,
                initial_capital: 0 // Explicitly 0 to test Smart Allocation
            },
            {
                id: 'passive_income_goal',
                goal_type_id: 2, // PASSIVE_INCOME (Priority 4/5)
                name: 'My Passive Income (House)',
                target_amount: 10000000,
                term_months: 120,
                initial_capital: 0
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
                initial_capital: 50000, // Client pays 50k premium now
                target_amount: 3000000,
                payment_variant: 0,
            }
        ];

        // Mock Portfolio for Passive Income too
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
            classes: JSON.stringify([3, 7, 2]), // Added 2
            amount_from: 0,
            amount_to: 100000000,
            term_from_months: 0,
            term_to_months: 120,
            risk_profiles: JSON.stringify(mockRiskProfiles)
        });

        try {
            // Expected (Updated for 60% of Remainder Rule):
            // 1. FinReserve: 300k
            // 2. Life: 50k
            // Remainder before Inv: 650k.
            // 3. Investment: 60% of Remainder (650k) = 390k.
            // 4. Passive: 40% of Remainder (650k) = 260k.

            const result = await calculationService.calculateFirstRun({ client, goals });

            const finRes = result.goals.find(g => g.goal_type === 'FIN_RESERVE');
            const life = result.goals.find(g => g.goal_type === 'LIFE');
            const inv = result.goals.find(g => g.goal_name.includes('Machine'));
            const pas = result.goals.find(g => g.goal_type === 'PASSIVE_INCOME');

            console.log('--- Results ---');
            console.log(`Pool Start: ${client.total_liquid_capital}`);
            console.log(`FinReserve: ${finRes.summary.initial_capital} (Expected 300,000)`);
            console.log(`Life: ${life.summary.initial_capital} (Expected 50,000)`);
            console.log(`Investment (Machine): ${inv.summary.initial_capital} (Expected 390,000 - 60% of Remainder)`);
            console.log(`Passive (House): ${pas.summary.initial_capital} (Expected 260,000 - Remainder)`);

            if (Math.abs(finRes.summary.initial_capital - 300000) < 1 &&
                Math.abs(life.summary.initial_capital - 50000) < 1 &&
                Math.abs(inv.summary.initial_capital - 390000) < 1 &&
                Math.abs(pas.summary.initial_capital - 260000) < 1) {
                console.log('✅ Smart Allocation Logic (60% of Remainder) verified successfully!');
            } else {
                console.error('❌ Allocation logic failed.');
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
