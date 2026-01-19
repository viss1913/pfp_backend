const calculationService = require('../src/services/calculationService');
const pensionCalculator = require('../src/services/calculators/PensionCalculator');
const nsjApiService = require('../src/services/nsjApiService');
require('dotenv').config();

async function deepAudit() {
    console.log('=== PENSION & LIFE AUDIT START ===');

    const clientData = {
        birth_date: "1986-12-31",
        sex: "male",
        avg_monthly_income: 150000,
        total_liquid_capital: 3500000
    };

    const context = await calculationService._prepareContext(clientData);
    console.log('\n--- System Settings (from DB) ---');
    console.log('Pension Point Cost:', context.settings.pension_point_cost);
    console.log('Pension Fixed Payment:', context.settings.pension_fixed_payment);
    console.log('Pension Max Salary Limit:', context.settings.pension_max_salary_limit);
    console.log('Inflation (Year):', context.settings.inflation_rate_year);

    console.log('\n--- Step 1: calculateStatePension Audit ---');
    const statePension = await pensionCalculator.calculateStatePension(clientData, context.settings, new Date());
    console.log('IPK estimated total:', statePension.ipk_est);
    console.log('Years to Pension:', statePension.years_to_pension);
    console.log('Future Monthly Pension (rub):', statePension.state_pension_monthly_future);
    console.log('Current-valued Pension (rub):', statePension.state_pension_monthly_current);

    console.log('\n--- Step 2: Life Insurance (NSJ) Premium Audit ---');
    const nsjParams = {
        target_amount: 1500000,
        term_months: 180,
        client: clientData,
        payment_variant: 12,
        program: 'test'
    };

    try {
        const nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
        console.log('NSJ Result:', JSON.stringify(nsjResult, null, 2));
    } catch (e) {
        console.error('NSJ API Failed during audit:', e);
    }
}

deepAudit().catch(console.error);
