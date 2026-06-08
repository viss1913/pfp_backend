'use strict';

const test = require('node:test');
const assert = require('node:assert');

const calculationService = require('../src/services/calculationService');

function makeContext(poolAmount, client = {}) {
    return {
        poolBalance: poolAmount,
        sharedPoolEvents: [{ month: 0, amount: poolAmount }],
        smartAllocationInvRentShare: 0.6,
        client,
    };
}

function indexed(goals) {
    return goals.map((goal, index) => ({ goal, index }));
}

function sumSmart(items) {
    return items.reduce((s, { goal }) => s + (Number(goal.smart_initial_capital) || 0), 0);
}

function goalByType(items, typeId) {
    return items.find(({ goal }) => goal.goal_type_id === typeId)?.goal;
}

test('smart allocation: investment gets full remainder when only pension competes (client 31 scenario)', async () => {
    const goals = [
        { id: 155, name: 'Финансовый резерв', goal_type_id: 7, initial_capital: 1_000_000, term_months: 12 },
        { id: 154, name: 'Сохранить и преумножить', goal_type_id: 3, initial_capital: 10_000_000, term_months: 120 },
        { id: 153, name: 'Достойная пенсия', goal_type_id: 1, target_amount: 150_000, term_months: 120, desired_monthly_income: 150_000 },
    ];
    const items = indexed(goals);
    const context = makeContext(10_000_000, { birth_date: '1978-02-11', sex: 'female' });

    await calculationService._calculateSmartAllocation(items, context);

    const reserve = goalByType(items, 7);
    const investment = goalByType(items, 3);
    const pension = goalByType(items, 1);

    assert.strictEqual(reserve.smart_initial_capital, 1_000_000);

    const afterReserve = 9_000_000;
    const pensionShare = calculationService._pensionInitialShareFromAge(48);
    const expectedPension = afterReserve * pensionShare;
    const expectedInvestment = afterReserve - expectedPension;

    assert.ok(Math.abs(pension.smart_initial_capital - expectedPension) < 1);
    assert.ok(Math.abs(investment.smart_initial_capital - expectedInvestment) < 1);
    assert.ok(Math.abs(sumSmart(items) - 10_000_000) < 1);
    assert.ok(investment.smart_initial_capital > 5_356_800, 'must be more than old 60% slice');
});

test('smart allocation: rent gets full remainder when only pension competes', async () => {
    const goals = [
        { id: 1, name: 'Резерв', goal_type_id: 7, initial_capital: 500_000, term_months: 12 },
        { id: 2, name: 'Аренда', goal_type_id: 8, target_amount: 2_000_000, term_months: 24 },
        { id: 3, name: 'Пенсия', goal_type_id: 1, target_amount: 100_000, term_months: 120, desired_monthly_income: 100_000 },
    ];
    const items = indexed(goals);
    const context = makeContext(5_000_000, { birth_date: '1980-01-01', sex: 'male' });

    await calculationService._calculateSmartAllocation(items, context);

    const rent = goalByType(items, 8);
    const pension = goalByType(items, 1);
    const afterReserve = 4_500_000;
    const age = calculationService._getClientAgeYears(context.client);
    const expectedPension = afterReserve * calculationService._pensionInitialShareFromAge(age);
    const expectedRent = afterReserve - expectedPension;

    assert.ok(Math.abs(pension.smart_initial_capital - expectedPension) < 1);
    assert.ok(Math.abs(rent.smart_initial_capital - expectedRent) < 1);
    assert.ok(Math.abs(sumSmart(items) - 5_000_000) < 1);
});

test('smart allocation: investment and rent split remainder when only pension competes', async () => {
    const goals = [
        { id: 1, name: 'Инвест', goal_type_id: 3, target_amount: 3_000_000, term_months: 120 },
        { id: 2, name: 'Аренда', goal_type_id: 8, target_amount: 1_000_000, term_months: 24 },
        { id: 3, name: 'Пенсия', goal_type_id: 1, target_amount: 100_000, term_months: 120 },
    ];
    const items = indexed(goals);
    const context = makeContext(4_000_000, { birth_date: '1985-06-01', sex: 'male' });

    await calculationService._calculateSmartAllocation(items, context);

    const inv = goalByType(items, 3);
    const rent = goalByType(items, 8);
    const pension = goalByType(items, 1);
    const afterPension = 4_000_000 - pension.smart_initial_capital;
    const invRentTotal = inv.smart_initial_capital + rent.smart_initial_capital;

    assert.ok(Math.abs(invRentTotal - afterPension) < 1);
    assert.ok(Math.abs(inv.smart_initial_capital - rent.smart_initial_capital) < 1);
    assert.ok(Math.abs(sumSmart(items) - 4_000_000) < 1);
});

test('smart allocation: 60% to investment when apartment also competes', async () => {
    const goals = [
        { id: 1, name: 'Резерв', goal_type_id: 7, initial_capital: 1_000_000, term_months: 12 },
        { id: 2, name: 'Инвест', goal_type_id: 3, target_amount: 5_000_000, term_months: 120 },
        { id: 3, name: 'Пенсия', goal_type_id: 1, target_amount: 150_000, term_months: 120 },
        { id: 4, name: 'Квартира', goal_type_id: 9, target_amount: 7_000_000, term_months: 60 },
    ];
    const items = indexed(goals);
    const context = makeContext(10_000_000, { birth_date: '1978-02-11', sex: 'female' });

    await calculationService._calculateSmartAllocation(items, context);

    const investment = goalByType(items, 3);
    const apartment = goalByType(items, 9);
    const pension = goalByType(items, 1);

    const afterReserve = 9_000_000;
    const afterPension = afterReserve - pension.smart_initial_capital;
    const expectedInvCap = afterPension * 0.6;

    assert.ok(Math.abs(investment.smart_initial_capital - expectedInvCap) < 1);
    assert.ok(apartment.smart_initial_capital > 0);
    assert.ok(Math.abs(sumSmart(items) - 10_000_000) < 1);
});
