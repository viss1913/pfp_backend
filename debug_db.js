const db = require('./src/config/database');

async function check() {
    try {
        console.log('--- PDS Settings ---');
        try {
            const pds = await db('pds_settings').select('*');
            console.table(pds);
        } catch (e) { console.log('pds_settings table error or not found'); }

        console.log('\n--- Goal Type IDs and Names ---');
        // Since goal_types table wasn't found, let's look at goals table for distinct type_ids
        const goalTypes = await db('goals').distinct('goal_type_id').select('goal_type_id');
        console.log(JSON.stringify(goalTypes, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
