const calculationService = require('../src/services/CalculationService');
const db = require('../src/config/database');

async function testNewGoals() {
    try {
        console.log('Testing FIN_RESERVE and RENT goals...');

        const client = {
            id: 1,
            birth_date: '1990-01-01',
            sex: 'male',
            total_liquid_capital: 2000000,
            assets: []
        };

        const goals = [
            {
                id: 'temp_fin_reserve',
                goal_type_id: 7, // FIN_RESERVE
                name: 'My Fin Reserve',
                initial_capital: 500000,
                monthly_replenishment: 10000,
                priority: 1
            },
            {
                id: 'temp_rent',
                goal_type_id: 8, // RENT
                name: 'My Rent Income',
                initial_capital: 1000000,
                // Rent doesn't usually have replenishment in this logic, but capital is main
                priority: 2
            }
        ];

        // 0. Inject Mock Data
        const mockRiskProfiles = [
            {
                profile_type: 'BALANCED',
                instruments: [
                    { product_id: 1, share_percent: 100, bucket_type: 'INITIAL_CAPITAL' },
                    { product_id: 1, share_percent: 100, bucket_type: 'TOP_UP' }
                ]
            }
        ];

        // Ensure we have a product. Let's pick ID 1 or find one.
        const product = await db('products').first();
        if (!product) {
            console.warn('No products found in DB. Cannot test calculation without products.');
            return;
        }
        mockRiskProfiles[0].instruments.forEach(i => i.product_id = product.id);

        const [portfolioId] = await db('portfolios').insert({
            name: 'TEST_FIN_RENT_PORTFOLIO',
            is_active: true,
            classes: JSON.stringify([7, 8]), // Valid for both types
            amount_from: 0,
            amount_to: 100000000,
            term_from_months: 0,
            term_to_months: 120,
            risk_profiles: JSON.stringify(mockRiskProfiles)
        });
        console.log(`Created temp portfolio ID: ${portfolioId}`);

        try {
            const result = await calculationService.calculateFirstRun({ client, goals });

            console.log('--- Result Mock ---');
            console.log(JSON.stringify(result, null, 2));

            const finRes = result.goals.find(g => g.goal_type === 'FIN_RESERVE');
            const rent = result.goals.find(g => g.goal_type === 'RENT');

            if (finRes && finRes.summary.total_capital_at_end > 500000) {
                console.log('✅ FIN_RESERVE calculated correctly (growth observed)');
                console.log(`   Initial: ${finRes.summary.initial_capital}, End: ${finRes.summary.total_capital_at_end}`);
            } else {
                console.error('❌ FIN_RESERVE calculation failed or no growth', finRes);
            }

            if (rent && rent.summary.monthlyIncomeRent >= 0) { // Can be 0 if yield is 0, but field should exist
                console.log('✅ RENT calculated correctly');
                console.log(`   Capital: ${rent.summary.initial_capital}, Monthly Income: ${rent.summary.monthlyIncomeRent}`);
            } else {
                console.error('❌ RENT calculation failed or no income', rent);
            }
        } finally {
            await db('portfolios').where({ id: portfolioId }).del();
            console.log('Cleaned up temp portfolio');
        }

    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        await db.destroy();
    }
}

testNewGoals();
