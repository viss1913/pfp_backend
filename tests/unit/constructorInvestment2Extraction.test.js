const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isFirstRunCalculationCommand,
    isInvestment2StageCommand,
    shouldForceInvestmentGoalOnFirstRun,
    applyInvestment2ExtractionOverride,
} = require('../../src/utils/constructorFirstRunCommands');

test('/INVESTMENT2 is collection stage, not first-run; firstRun from it forces INVESTMENT', () => {
    assert.equal(isInvestment2StageCommand('/INVESTMENT2'), true);
    assert.equal(isInvestment2StageCommand('/INVESTMENT'), false);
    assert.equal(isFirstRunCalculationCommand('/INVESTMENT2'), false);
    assert.equal(isFirstRunCalculationCommand('/firstRunAIB2C'), true);
    assert.equal(shouldForceInvestmentGoalOnFirstRun('/firstRunAIB2C', '/INVESTMENT2'), true);
    assert.equal(shouldForceInvestmentGoalOnFirstRun('/firstRunAIB2C', '/gosPension'), false);
    assert.equal(shouldForceInvestmentGoalOnFirstRun('/INVESTMENT2', '/INVESTMENT2'), false);
});

test('drops pension goal and IPK, keeps capital and replenishment', () => {
    const extraction = {
        client: {
            sex: 'male',
            birth_date: '1986-01-01',
            avg_monthly_income: 150000,
            total_liquid_capital: 500000,
            ipk_current: 42,
        },
        goals: [
            {
                goal_type_id: 1,
                name: 'Достойная пенсия',
                desired_monthly_income: 80000,
                target_amount: 80000,
                initial_capital: 500000,
                monthly_replenishment: 20000,
                ipk_current: 42,
            },
        ],
    };
    applyInvestment2ExtractionOverride(extraction);
    assert.equal(extraction.goals.length, 1);
    assert.equal(extraction.goals[0].goal_type_id, 3);
    assert.equal(extraction.goals[0].name, 'Сохранить и приумножить');
    assert.equal(extraction.goals[0].target_amount, 0);
    assert.equal(extraction.goals[0].initial_capital, 500000);
    assert.equal(extraction.goals[0].monthly_replenishment, 20000);
    assert.equal(extraction.client.ipk_current, undefined);
});

test('empty goals still become INVESTMENT, not pension', () => {
    const extraction = {
        client: { total_liquid_capital: 100000 },
        goals: [],
    };
    applyInvestment2ExtractionOverride(extraction);
    assert.equal(extraction.goals.length, 1);
    assert.equal(extraction.goals[0].goal_type_id, 3);
    assert.equal(extraction.goals[0].initial_capital, 100000);
    assert.equal(extraction.goals[0].monthly_replenishment, 0);
});
