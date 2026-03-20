const calculationService = require('./src/services/calculationService');

async function run() {
    const data = {
        assets: [
            {
                type: "CASH",
                name: "Наличные",
                current_value: 1000000,
                currency: "RUB",
                start_date: "2026-03-16"
            }
        ],
        client: {
            birth_date: "1979-12-31",
            sex: "male",
            fio: "",
            avg_monthly_income: 150000,
            total_liquid_capital: 1000000,
            risk_profile_answers: {}
        },
        goals: [
            {
                goal_type_id: 1,
                name: "Достойная пенсия",
                risk_profile: "BALANCED",
                target_amount: 210000,
                desired_monthly_income: 210000,
                term_months: 120
            },
            {
                goal_type_id: 9,
                name: "Квартира",
                risk_profile: "BALANCED",
                target_amount: 7400000,
                term_months: 60
            },
            {
                goal_type_id: 7,
                name: "Финансовый резерв",
                risk_profile: "CONSERVATIVE",
                target_amount: 100000,
                term_months: 12,
                initial_capital: 100000,
                monthly_replenishment: 5000
            },
            {
                goal_type_id: 5,
                name: "Защита Жизни",
                risk_profile: "CONSERVATIVE",
                target_amount: 2000000,
                term_months: 180,
                initial_capital: 133333.33333333334,
                monthly_replenishment: 11111.111111111111
            }
        ]
    };

    const res = await calculationService.calculateFirstRun(data, null, null, { isFirstRun: true, usePool: true });
    console.log('Consolidated portfolio:', JSON.stringify(res.summary.consolidated_portfolio, null, 2));
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

