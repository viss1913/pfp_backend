const db = require('./src/config/database');

async function fix() {
    try {
        console.log('--- Fixing settings ---');

        // 1. Fix pension_point_cost (comma to dot)
        const pointCost = await db('system_settings').where({ key: 'pension_point_cost' }).first();
        if (pointCost && typeof pointCost.value === 'string' && pointCost.value.includes(',')) {
            const newValue = pointCost.value.replace(',', '.');
            await db('system_settings').where({ key: 'pension_point_cost' }).update({ value: newValue });
            console.log(`Updated pension_point_cost: ${pointCost.value} -> ${newValue}`);
        }

        // 2. Add inflation_rate_year if missing
        const inflationYear = await db('system_settings').where({ key: 'inflation_rate_year' }).first();
        if (!inflationYear) {
            // Estimate from monthly if exists
            const inflationMonthly = await db('system_settings').where({ key: 'inflation_rate_monthly' }).first();
            let val = '5.6'; // default
            if (inflationMonthly) {
                // (1 + r)^12 - 1
                const m = parseFloat(inflationMonthly.value) / 100;
                val = ((Math.pow(1 + m, 12) - 1) * 100).toFixed(2);
            }
            await db('system_settings').insert({
                key: 'inflation_rate_year',
                value: val,
                value_type: 'number',
                category: 'GENERAL',
                description: 'Годовая ставка инфляции (%)'
            });
            console.log(`Added inflation_rate_year: ${val}`);
        }

        console.log('--- Done ---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
