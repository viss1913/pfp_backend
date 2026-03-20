const db = require('./src/config/database');

async function clean() {
    try {
        const settings = await db('system_settings').select('*');
        console.log('--- Cleaning settings ---');

        for (const s of settings) {
            if (typeof s.value === 'string') {
                // Remove non-breaking spaces and other weird stuff
                let cleanValue = s.value.replace(/[^\d.,-]/g, '').trim();
                // Normalize decimal separator
                cleanValue = cleanValue.replace(',', '.');

                if (cleanValue !== s.value) {
                    await db('system_settings').where({ id: s.id }).update({ value: cleanValue });
                    console.log(`Updated ${s.key}: "${s.value}" -> "${cleanValue}"`);
                }
            }
        }

        console.log('--- Done ---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

clean();
