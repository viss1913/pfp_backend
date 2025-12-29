const URL = 'http://localhost:3001/api/client/calculate';

const payload = {
    client: {
        birth_date: '1990-01-01', // Age ~35
        sex: 'male',
        avg_monthly_income: 110000
    },
    goals: [
        {
            goal_type_id: 1, // Pension
            name: 'Моя Пенсия',
            target_amount: 80000, // Desired monthly income
            term_months: 360, // 30 years (35 -> 65)
            initial_capital: 70000,
            risk_profile: 'BALANCED',
            start_date: '2025-01-01'
        }
    ]
};

async function run() {
    console.log('--- Sending Request to Railway (Localhost) ---');
    console.log('URL:', URL);

    try {
        const res = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-agent-id': '1'
            },
            body: JSON.stringify(payload)
        });

        console.log('Status:', res.status);
        const data = await res.json();

        // Summarize arrays to avoid huge output
        if (data.results && data.results[0] && data.results[0].result) {
            const r = data.results[0].result;
            if (r.pds_cofinancing && r.pds_cofinancing.yearly_breakdown) {
                r.pds_cofinancing.yearly_breakdown = `[Array of ${r.pds_cofinancing.yearly_breakdown.length} items]`;
            }
            if (r.investment_calculation && r.investment_calculation.yearly_breakdown_own) {
                r.investment_calculation.yearly_breakdown_own = `[Array of ${r.investment_calculation.yearly_breakdown_own.length} items]`;
            }
            if (r.financials && r.financials.yearly_breakdown) { // if exists
                r.financials.yearly_breakdown = `[Array]`;
            }
            // For Pension goal, checking breakdowns in result structure
            if (r.pds_cofinancing && Array.isArray(r.pds_cofinancing.yearly_breakdown)) {
                r.pds_cofinancing.yearly_breakdown = `[Array ${r.pds_cofinancing.yearly_breakdown.length}]`;
            }
        }

        console.log('Response Body (Summarized):');
        console.log(JSON.stringify(data, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
        if (err.cause) console.error('Cause:', err.cause);
    }
}

run();
