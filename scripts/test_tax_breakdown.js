const calculationService = require('../src/services/calculationService');

// Mock data
const mockClient = {
    birth_date: '1990-01-01',
    sex: 'male',
    avg_monthly_income: 100000,
    total_liquid_capital: 0,
    assets: []
};

const mockGoals = [
    {
        goal_type_id: 1, // Pension -> uses PDS
        name: 'Pension Strategy',
        target_amount: 10000000,
        term_months: 120, // 30 years
        initial_capital: 0,
        monthly_replenishment: 10000,
        priority: 2
    },
    {
        goal_type_id: 5, // Life
        name: 'Life Insurance',
        target_amount: 3000000,
        term_months: 120, // 10 years
        initial_capital: 0,
        priority: 1
    }
];

// Mock settings Service
const settingsService = require('../src/services/settingsService');
settingsService.get = async () => ({ value: 0 }); // simplistic
settingsService.getPdsCofinSettings = async () => ({});
settingsService.getAllPdsCofinIncomeBrackets = async () => [];
settingsService.getAllTaxBrackets = async () => [];

// Mock NSJ Service
const nsjApiService = require('../src/services/nsjApiService');
nsjApiService.calculateLifeInsurance = async () => ({
    total_premium: 30000, // Monthly
    total_premium_rur: 30000,
    risks: []
});

// Mock PDS Cofinancing
const pdsCofinancingService = require('../src/services/pdsCofinancingService');
// We need to overwrite the method to return deterministic yearly breakdown for testing
const originalCalculate = pdsCofinancingService.calculateCofinancingEffect;
pdsCofinancingService.calculateCofinancingEffect = async (params) => {
    // Generate fake yearly data
    const yearlyData = [];
    const startYear = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
        yearlyData.push({
            year: startYear + i,
            tax_refund_received: 13000, // Deduction
            cofinancing_paid_in_year: 36000 // Cofinancing
        });
    }

    return {
        recommendedReplenishment: params.initialReplenishment,
        total_cofinancing_nominal: 36000 * 10,
        total_tax_deductions_nominal: 13000 * 10,
        yearly_breakdown: yearlyData,
        pds_applied: true
    };
};

// Mock other calculators
const pensionCalculator = require('../src/services/calculators/PensionCalculator');
pensionCalculator.calculate = async (goal, context) => {
    // Use PDS service
    const pdsRes = await pdsCofinancingService.calculateCofinancingEffect({
        initialReplenishment: 10000,
        pdsShareTopUp: 100,
        initialCapital: 0,
        pdsShareInitial: 0
    });

    return {
        goal_id: 1,
        goal_type: 'PENSION',
        summary: { state_benefit: pdsRes.total_cofinancing_nominal + pdsRes.total_tax_deductions_nominal },
        details: {
            ...pdsRes
        }
    };
};

const lifeCalculator = require('../src/services/calculators/LifeInsuranceCalculator');
lifeCalculator.calculate = async (goal, context) => {
    return {
        goal_id: 5,
        goal_type: 'LIFE',
        summary: { state_benefit: 15600 + 156000 },
        details: {
            annual_premium: 360000,
            tax_deduction_2026: 15600, // Fake 2026 deduction
            total_tax_deductions: 156000 // Fake total
        }
    };
};


async function runTest() {
    try {
        console.log('Running test...');
        const result = await calculationService.calculateFirstRun({
            client: mockClient,
            goals: mockGoals
        });

        console.log('Tax Benefits Summary:');
        console.log(JSON.stringify(result.summary.tax_benefits_summary, null, 2));

        const totals = result.summary.tax_benefits_summary.totals;

        // Validation Logic
        const currentYear = new Date().getFullYear(); // 2026
        // PDS Mock: 2026 data -> deduction 13000, cofin 36000
        // NSJ Mock: 2026 data -> deduction 15600

        // Expected Deduction 2026: 13000 + 15600 = 28600
        // Expected Cofin 2026: 36000

        // Expected Total Deduction: (13000 * 10) + 156000 = 130000 + 156000 = 286000
        // Expected Total Cofin: (36000 * 10) = 360000

        if (totals.deduction_2026 === 28600 &&
            totals.cofinancing_2026 === 36000 &&
            totals.total_deductions === 286000 &&
            totals.total_cofinancing === 360000) {
            console.log('SUCCESS: All values match expected results.');
        } else {
            console.error('FAILURE: Values do not match.');
            console.log(`Expected Deduction 2026: 28600, Got: ${totals.deduction_2026}`);
            console.log(`Expected Cofin 2026: 36000, Got: ${totals.cofinancing_2026}`);
            console.log(`Expected Total Ded: 286000, Got: ${totals.total_deductions}`);
            console.log(`Expected Total Cofin: 360000, Got: ${totals.total_cofinancing}`);
        }

    } catch (err) {
        console.error('Test Failed with Error:', err);
    }
}

runTest();
