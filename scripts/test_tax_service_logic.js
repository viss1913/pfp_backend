
require('dotenv').config();
const TaxService = require('../src/services/TaxService');
// Mocking DB connection context via requiring it implicitly in TaxService
const db = require('../src/config/database');

async function testTaxLogic() {
    console.log('=== TESTING TAX SERVICE LOGIC ===\n');

    try {
        const year = 2025;

        // 1. NDFL Calculation Tests
        const incomes = [
            1000000,    // 1M: 13%
            3000000,    // 3M: 13% of 2.4, 15% of 0.6
            6000000,    // 6M: 13% of 2.4, 15% of 2.6, 18% of 1.0
            60000000    // 60M: Full scale
        ];

        console.log('--- NDFL PROGRESSIVE SCALE ---');
        for (const inc of incomes) {
            const res = await TaxService.calculateNdfl(inc, year);
            console.log(`Income: ${inc.toLocaleString('ru-RU')} ₽`);
            console.log(`  Tax: ${res.taxAmount.toLocaleString('ru-RU')} ₽`);
            console.log(`  Effective Rate: ${(res.effectiveRate * 100).toFixed(2)}%`);
            console.log(`  Brackets used: ${res.brackets.length}`);
            // console.log(JSON.stringify(res.brackets, null, 2));
            console.log('');
        }

        // 2. PDS Deduction Tests
        console.log('--- PDS DEDUCTION LOGIC ---');

        const scenarios = [
            {
                name: "Standard Case (Under Limit)",
                income: 1200000, // Tax ~156k
                contrib: 300000,
            },
            {
                name: "Over Limit (500k contrib)",
                income: 1200000,
                contrib: 500000, // Should cap at 400k
            },
            {
                name: "Tax Cap (Low Income)",
                income: 300000, // Tax ~39k
                contrib: 400000, // Pot refund 52k. Cap at 39k.
            }
        ];

        for (const scen of scenarios) {
            console.log(`Scenario: ${scen.name}`);

            // Calc base tax first to get limits
            const taxRes = await TaxService.calculateNdfl(scen.income, year);
            const clientProfile = {
                annual_income_taxable: scen.income,
                ndfl_amount_without_deductions: taxRes.taxAmount,
                ndfl_rate_value: 0.13 // Simplified, can take from taxRes logic if exposed
            };

            // Check top rate used
            const topBracket = taxRes.brackets[taxRes.brackets.length - 1];
            if (topBracket) {
                // Approximate marginal logic: use the rate of the last bracket
                // In reality, deduction might cross brackets, but usually simplified to "rate of income"
                clientProfile.ndfl_rate_value = topBracket.rate / 100;
            }

            const dedRes = await TaxService.calculatePdsDeduction(clientProfile, scen.contrib, year);

            console.log(`  Income: ${scen.income.toLocaleString()} | Tax Paid: ${clientProfile.ndfl_amount_without_deductions.toLocaleString()}`);
            console.log(`  Contrib: ${scen.contrib.toLocaleString()}`);
            console.log(`  Deduction Base: ${dedRes.deductionBase.toLocaleString()}`);
            console.log(`  Refund: ${dedRes.refundAmount.toLocaleString()} (Rate: ${dedRes.rateUsed})`);

            if (dedRes.refundAmount === clientProfile.ndfl_amount_without_deductions) {
                console.log('  -> LIMITED BY TAX PAID');
            } else if (dedRes.deductionBase < scen.contrib) {
                console.log('  -> LIMITED BY 400k BASE');
            }
            console.log('');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await db.destroy();
    }
}

testTaxLogic();
