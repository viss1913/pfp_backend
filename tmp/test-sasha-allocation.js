'use strict';
const cs = require('../src/services/calculationService');
const { sortGoalsForCalculationOrder } = require('../src/utils/sortGoalsForCalculation');

const payload = {
  client: { birth_date: '1987-05-27', gender: 'male', sex: 'male', total_liquid_capital: 2000000 },
  assets: [{ type: 'CASH', name: 'Капитал клиента', current_value: 2000000, currency: 'RUB' }],
  goals: [
    { goal_type_id: 3, name: 'Сохранить и преумножить', inflation_rate: 5.6, risk_profile: 'BALANCED', initial_capital: 2000000, monthly_replenishment: 50000, target_amount: 0, term_months: 60 },
    { goal_type_id: 7, name: 'Финансовый резерв', inflation_rate: 5.6, risk_profile: 'CONSERVATIVE', initial_capital: 360000, monthly_replenishment: 10000, target_amount: 360000, term_months: 12 },
    { goal_type_id: 1, name: 'Пенсия', inflation_rate: 4.8, risk_profile: 'BALANCED', desired_monthly_income: 85000, target_amount: 85000, term_months: 60 },
    { goal_type_id: 5, name: 'Защита Жизни', inflation_rate: 5.6, risk_profile: 'CONSERVATIVE', target_amount: 1200000, term_months: 60 }
  ]
};

(async () => {
  const ctx = await cs._prepareContext({
    ...payload.client,
    assets: payload.assets,
    total_liquid_capital: payload.client.total_liquid_capital
  });
  const sorted = sortGoalsForCalculationOrder(payload.goals);
  const indexed = sorted.map((g, i) => ({ goal: JSON.parse(JSON.stringify(g)), index: i }));
  await cs._calculateSmartAllocation(indexed, ctx);
  console.log('Pool start:', ctx.poolBalance);
  for (const { goal } of indexed) {
    console.log(
      goal.name,
      '| type', goal.goal_type_id,
      '| req initial', goal.initial_capital,
      '| smart', goal.smart_initial_capital
    );
  }
  const sum = indexed.reduce((s, x) => s + (Number(x.goal.smart_initial_capital) || 0), 0);
  console.log('Sum smart:', sum, '| vs pool:', ctx.poolBalance);
})();
