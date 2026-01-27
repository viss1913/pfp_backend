const mysql = require('mysql2/promise');
require('dotenv').config();

async function hunt() {
    const password = (process.env.MYSQLPASSWORD || '').trim();
    const host = 'yamanote.proxy.rlwy.net';
    const port = 55948;
    const users = ['root', 'railway'];

    console.log(`Database Host: ${host}:${port}`);
    console.log(`Password (start/end): ${password[0]}...${password[password.length - 1]} (${password.length} chars)`);
    console.log('------------------------------------------');

    for (const user of users) {
        console.log(`\nChecking user: ${user}...`);
        try {
            const conn = await mysql.createConnection({
                host, port, user, password, database: 'railway'
            });
            console.log(`✅ SUCCESS! User '${user}' is working.`);
            await conn.end();
            return;
        } catch (e) {
            console.log(`❌ FAIL for ${user}: ${e.message}`);
        }
    }

    console.log('\n------------------------------------------');
    console.log('TIP: Check if MYSQLUSER in Railway is different.');
    console.log('TIP: Double check the Public Port (it might have changed from 55948).');
}

hunt();
