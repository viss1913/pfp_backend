require('dotenv').config({ override: true });
const knex = require('../src/config/database');

async function inspect() {
    console.log('--- Inspecting Pension Portfolio Structure ---');
    try {
        // Find portfolio by checking valid JSON inside 'classes' or simply getting all and filtering
        const portfolios = await knex('portfolios').select('*');

        const pensionPortfolio = portfolios.find(p => {
            // classes can be array or string
            let classes = [];
            try {
                classes = typeof p.classes === 'string' ? JSON.parse(p.classes) : p.classes;
            } catch (e) { }
            return Array.isArray(classes) && classes.includes(1);
        });

        if (!pensionPortfolio) {
            console.log('No Pension Portfolio (Class 1) found!');
            return;
        }

        console.log(`Found Portfolio: ${pensionPortfolio.name} (ID: ${pensionPortfolio.id})`);

        let profiles = [];
        try {
            profiles = typeof pensionPortfolio.risk_profiles === 'string' ? JSON.parse(pensionPortfolio.risk_profiles) : pensionPortfolio.risk_profiles;
        } catch (e) {
            console.log('Error parsing risk_profiles');
        }

        const balanced = profiles.find(p => p.profile_type === 'BALANCED');
        if (balanced) {
            console.log('BALANCED Profile found:');
            console.log('Initial Capital Distribution:', JSON.stringify(balanced.initial_capital, null, 2));
            console.log('Top Up Distribution:', JSON.stringify(balanced.top_up, null, 2));
        } else {
            console.log('BALANCED Profile NOT found in this portfolio.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

inspect();
