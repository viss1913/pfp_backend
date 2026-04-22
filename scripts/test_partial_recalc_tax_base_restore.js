const calculationService = require('../src/services/calculationService');
const TaxService = require('../src/algorithms/TaxService');

async function run() {
    const originalCalculateNdfl = TaxService.calculateNdfl.bind(TaxService);

    try {
        // Deterministic flat-tax mock for inversion checks.
        TaxService.calculateNdfl = async (annualIncome) => {
            const income = Math.max(0, Number(annualIncome || 0));
            return {
                taxAmount: Math.round(income * 0.13 * 100) / 100,
                effectiveRate: 0.13,
                brackets: []
            };
        };

        const baseContext = {
            usedTaxBasePerYear: {},
            cachedData: { taxBrackets: [] },
            projectId: 14
        };

        const estimate1 = await calculationService._estimateUsedTaxBaseFromRefund({
            year: 2026,
            refundAmount: 52000,
            context: baseContext,
            annualIncome: 3_000_000
        });

        if (Math.abs(estimate1 - 400000) > 2) {
            throw new Error(`Expected ~400000 base for 52000 refund, got ${estimate1}`);
        }

        baseContext.usedTaxBasePerYear[2026] = 200000;
        const estimate2 = await calculationService._estimateUsedTaxBaseFromRefund({
            year: 2026,
            refundAmount: 26000,
            context: baseContext,
            annualIncome: 3_000_000
        });

        if (Math.abs(estimate2 - 200000) > 2) {
            throw new Error(`Expected ~200000 remaining base for 26000 refund, got ${estimate2}`);
        }

        const extracted = calculationService._extractLongTermRefundFromYearBreakdown({
            tax_refund_breakdown: { pds: 22000, iis: 30000, children: 5000 }
        });
        if (extracted !== 52000) {
            throw new Error(`Expected long-term refund 52000, got ${extracted}`);
        }

        console.log('PASS: partial recalc tax-base restoration helpers are consistent.');
    } finally {
        TaxService.calculateNdfl = originalCalculateNdfl;
    }
}

run().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
