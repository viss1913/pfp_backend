const URL = 'http://localhost:3001/api/client/calculate';

const payload = {
    client: {
        birth_date: '1990-01-01',
        sex: 'male',
        avg_monthly_income: 110000
    },
    goals: [
        {
            goal_type_id: 1,
            name: 'Моя Пенсия',
            target_amount: 80000,
            term_months: 360,
            initial_capital: 70000,
            risk_profile: 'BALANCED',
            start_date: '2025-01-01'
        }
    ]
};

async function run() {
    console.log('--- Sending Request (Clean Mode) ---');
    try {
        const res = await fetch(URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-agent-id': '1' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.goals && data.goals[0]) {
            const r = data.goals[0];
            console.log('--- State Pension Result ---');
            console.log(JSON.stringify(r.state_pension || {}, null, 2));
            console.log('\n--- Pension Gap ---');
            console.log(JSON.stringify(r.pension_gap || {}, null, 2));
            console.log('\n--- Summary ---');
            console.log(JSON.stringify(r.summary || {}, null, 2));
            console.log('\n--- Financials (Partial) ---');
            const fin = { ...(r.financials || {}) };
            if (fin.yearly_breakdown) fin.yearly_breakdown = '[Array]';
            console.log(JSON.stringify(fin, null, 2));
        } else {
            console.log('Structure unexpected or error:');
            // Print only keys to avoid flooding
            console.log(Object.keys(data));
            if (data.results) console.log('Results length:', data.results.length);
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

run();
