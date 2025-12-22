require('dotenv').config({ override: true });
const knex = require('../src/config/database');

async function diagnose() {
    console.log('--- Diagnosing Pension Portfolio Data ---');
    try {
        // 1. Find Pension Portfolios
        const portfolios = await knex('portfolios').where('portfolio_class_id', 1);
        console.log(`Found ${portfolios.length} portfolios with class_id = 1`);

        for (const p of portfolios) {
            console.log(`\nPortfolio ID: ${p.id}, Name: ${p.name}`);

            // 2. Parse Risk Profiles
            let profiles = [];
            try {
                profiles = typeof p.risk_profiles === 'string' ? JSON.parse(p.risk_profiles) : p.risk_profiles;
            } catch (e) {
                console.log('Error parsing risk_profiles:', e.message);
                continue;
            }

            // 3. Check BALANCED profile
            const balanced = profiles.find(rp => rp.profile_type === 'BALANCED');
            if (!balanced) {
                console.log(' - No BALANCED profile found.');
                continue;
            }
            console.log(' - Found BALANCED profile.');

            // 4. Check Initial Capital distribution
            const initCap = balanced.initial_capital || [];
            console.log(' - Initial Capital Distribution:', JSON.stringify(initCap));

            for (const item of initCap) {
                // 5. Check Product Yields
                const product = await knex('products').where('id', item.product_id).first();
                if (!product) {
                    console.log(`   - Product ID ${item.product_id} NOT FOUND!`);
                    continue;
                }
                console.log(`   - Product ID ${product.id} (${product.name}):`);

                let yields = [];
                try {
                    yields = typeof product.product_yields === 'string' ? JSON.parse(product.product_yields) : product.product_yields;
                    // If product_yields column is empty or null, check if there's a separate table or json structure
                    // Based on schema, it seems yields are often stored in 'product_yields' JSON column or a separate table?
                    // Let's assume JSON column 'product_yields' based on previous context, OR a separate table 'product_yields'.
                    // Wait, previous code used `product.yields`. In `calculationService`, `productRepository.findById` attaches yields.
                    // Let's check the product table columns.
                } catch (e) { }

                // Actually, let's query the table `product_yields` if it exists, roughly based on naming convention
                // Or check `products` table columns.
                // Better: rely on what I see in `calculationService`: `product.yields` suggests it's joined or fetched.

                // Let's query `product_yields` table directly for this product_id
                const dbYields = await knex('product_yields').where('product_id', product.id);
                console.log(`     - DB Yield Lines: ${dbYields.length}`);
                dbYields.forEach(y => {
                    console.log(`       - Term: ${y.term_from_months}-${y.term_to_months} mo, Amt: ${y.amount_from}-${y.amount_to}, Yield: ${y.yield_percent}%`);
                });
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await knex.destroy();
    }
}

diagnose();
