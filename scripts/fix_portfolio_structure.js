require('dotenv').config({ override: true });
const knex = require('../src/config/database');

async function fixPortfolio() {
    console.log('--- Fixing Pension Portfolio Structure ---');
    try {
        const portfolioId = 4; // Pension
        const portfolio = await knex('portfolios').where('id', portfolioId).first();

        if (!portfolio) {
            console.error('Portfolio 4 not found');
            return;
        }

        let profiles = [];
        try {
            profiles = typeof portfolio.risk_profiles === 'string' ? JSON.parse(portfolio.risk_profiles) : portfolio.risk_profiles;
        } catch (e) {
            console.log('Error parsing profiles, resetting to empty array');
            profiles = [];
        }

        // Find or Create BALANCED
        const balancedIndex = profiles.findIndex(p => p.profile_type === 'BALANCED');

        const validStructure = {
            "profile_type": "BALANCED",
            "initial_capital": [
                { "product_id": 3, "share_percent": 100 }
            ],
            "top_up": [
                { "product_id": 3, "share_percent": 100 }
            ],
            "expected_yield": 15
        };

        if (balancedIndex !== -1) {
            console.log('Updating existing BALANCED profile...');
            profiles[balancedIndex] = { ...profiles[balancedIndex], ...validStructure };
        } else {
            console.log('Adding new BALANCED profile...');
            profiles.push(validStructure);
        }

        await knex('portfolios').where('id', portfolioId).update({
            risk_profiles: JSON.stringify(profiles),
            updated_at: new Date()
        });

        console.log('✅ Portfolio updated successfully.');

    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

fixPortfolio();
