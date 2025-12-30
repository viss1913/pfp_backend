
require('dotenv').config();
const pdsService = require('../src/services/pdsCofinancingService');
const db = require('../src/config/database');

async function testPdsWithTax() {
    console.log('=== TESTING PDS + TAX INTEGRATION ===\n');

    try {
        const params = {
            capitalGap: 0,
            initialReplenishment: 10000, // 10k/month
            initialCapital: 0,
            pdsShareInitial: 0,
            pdsShareTopUp: 100, // 100% into PDS
            pdsProductId: 1, // Need valid ID
            termMonths: 36, // 3 years
            avgMonthlyIncome: 100000, // 1.2M/year -> 13% tax
            startDate: new Date(2024, 0, 1), // Jan 2024
            monthlyGrowthRate: 0,
            portfolioYieldMonthly: 0.01,
            usedCofinancingPerYear: {}
        };

        const products = await db('products').where('product_type', 'PDS').limit(1);
        if (products.length === 0) {
            console.error('No PDS product found in DB to test.');
            return;
        }
        params.pdsProductId = products[0].id;
        console.log(`Using Product ID: ${params.pdsProductId}`);

        const result = await pdsService.calculateCofinancingEffect(params);

        console.log('\n--- Yearly Breakdown ---');
        console.table(result.yearly_breakdown.map(y => ({
            Yr: y.year,
            Contrib: y.client_contrib_year,
            CofinEarned: y.cofinancing_earned,
            TaxRefRec: y.tax_refund_received,
            TaxRefProj: y.tax_refund_projected,
            ROI: y.roi_immediate + '%',
            CapEnd: y.capital_end_of_year
        })));

        // Verification logic
        const y2025 = result.yearly_breakdown.find(y => y.year === 2025);
        if (y2025) {
            console.log('\nVerifying 2025 Refund (for 2024):');
            // Simulation starts Feb -> 11 months * 10k = 110k contrib.
            // Refund = 110k * 0.13 = 14300.
            console.log(`Expected Refund: 14300`);
            console.log(`Actual Refund:   ${y2025.tax_refund_received}`);

            if (Math.abs(y2025.tax_refund_received - 14300) < 100) {
                console.log('✅ Refund Matches Expectation (14300 for 11 months)');
            } else {
                console.error('❌ Refund Mismatch');
            }
        }

        console.log('\nVerifying ROI 2024 (proj):');
        const y2024 = result.yearly_breakdown.find(y => y.year === 2024);
        console.log(`Actual ROI: ${y2024.roi_immediate}%`);

    } catch (e) {
        console.error(e);
    } finally {
        await db.destroy();
    }
}

testPdsWithTax();
