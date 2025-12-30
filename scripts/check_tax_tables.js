
require('dotenv').config();
const db = require('../src/config/database');

async function checkTaxTables() {
    try {
        console.log('🔍 Checking tax tables...\n');

        const tablesToCheck = [
            'tax_income_rates',
            'client_tax_profile',
            'pds_contracts',
            'tax_deduction_rules',
            'tax_deductions_summary'
        ];

        for (const tableName of tablesToCheck) {
            const exists = await db.schema.hasTable(tableName);
            console.log(`Table '${tableName}': ${exists ? 'EXISTS' : 'MISSING'}`);

            if (exists) {
                const columns = await db(tableName).columnInfo();
                console.log(`   Columns: ${Object.keys(columns).join(', ')}`);
            }
        }

        console.log('\n✅ Table check completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkTaxTables();
