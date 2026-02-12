require('dotenv').config();
const mysql = require('mysql2/promise');

async function testPublicConnection() {
    const url = process.env.MYSQL_PUBLIC_URL;
    if (!url) {
        console.log('❌ MYSQL_PUBLIC_URL not found in .env');
        return;
    }

    console.log(`Attempting to connect to PUBLIC URL: ${url.replace(/:[^:@]+@/, ':****@')}...`);
    const start = Date.now();
    try {
        const connection = await mysql.createConnection({
            uri: url,
            connectTimeout: 10000 // 10s timeout
        });
        await connection.ping();
        console.log(`✅ SUCCESS! Connected in ${Date.now() - start}ms`);
        await connection.end();
    } catch (err) {
        console.error(`❌ FAILED after ${Date.now() - start}ms:`, err.message);
        console.log('\n--- Troubleshooting Tips ---');
        console.log('1. Check if the database is running in Railway Dashboard.');
        console.log('2. Ensure your IP is not blocked (though Railway proxy usually allows all).');
        console.log('3. Verify the password in .env matches Railway variables.');
    }
}

testPublicConnection();
