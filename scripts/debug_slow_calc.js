const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/config/database');
const CalculationService = require('../src/services/calculationService');
const clientRepository = require('../src/repositories/clientRepository');
const productRepository = require('../src/repositories/productRepository');
const portfolioRepository = require('../src/repositories/portfolioRepository');
const settingsService = require('../src/services/settingsService');
const PensionCalculator = require('../src/services/calculators/PensionCalculator');

const mockClient = {
    birth_date: "1986-12-31",
    sex: "male",
    avg_monthly_income: 150000,
    total_liquid_capital: 300000,
    id: 9999
};

const mockGoals = [
    {
        goal_type_id: 1,
        name: "Пенсия",
        risk_profile: "BALANCED",
        inflation_rate: 5,
        target_amount: 80000,
        term_months: 120,
        initial_capital: 0
    },
    {
        goal_type_id: 7,
        name: "Финансовый резерв",
        risk_profile: "CONSERVATIVE",
        inflation_rate: 10,
        initial_capital: 40000,
        monthly_replenishment: 5000,
        target_amount: 40000,
        term_months: 12
    }
];

const mockAssets = [
    {
        type: "CASH",
        name: "Наличные",
        current_value: 300000,
        currency: "RUB",
        start_date: "2026-01-06"
    }
];

async function run() {
    console.time('Total Calculation');

    try {
        // Prepare context
        const context = {
            client: mockClient,
            settings: await settingsService.getAllSettings(),
            repositories: {
                portfolioRepository,
                productRepository
            },
            assets: mockAssets,
            sharedPoolEvents: [],
            usedCofinancingPerYear: {},
            usedTaxBasePerYear: {},
            services: {
                settingsService
            }
        };

        // 1. Run Pension Calculator manually to time it
        console.time('Pension Calculation');
        const pensionGoal = mockGoals.find(g => g.goal_type_id === 1);
        await PensionCalculator.calculate(pensionGoal, context);
        console.timeEnd('Pension Calculation');

        // 2. Run Main Service (if possible, skipping DB writes for client updates if any)
        // We'll just mimic what CalculationService.calculateFirstRun does

        console.log('--- Done ---');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        console.timeEnd('Total Calculation');
        process.exit();
    }
}

run();
