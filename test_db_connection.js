require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnections() {
    const urls = {
        'INTERNAL (MYSQL_URL)': process.env.MYSQL_URL,
        'PUBLIC (MYSQL_PUBLIC_URL)': process.env.MYSQL_PUBLIC_URL
    };

    for (const [name, url] of Object.entries(urls)) {
        if (!url) {
            console.log(`[${name}] No URL found in .env`);
            continue;
        }

        console.log(`[${name}] Attempting to connect to ${url.replace(/:[^:@]+@/, ':****@')}...`);
        const start = Date.now();
        try {
            const connection = await mysql.createConnection(url);
            await connection.ping();
            console.log(`[${name}] ✅ SUCCESS! Connected in ${Date.now() - start}ms`);
            await connection.end();
        } catch (err) {
            console.error(`[${name}] ❌ FAILED after ${Date.now() - start}ms:`, err.message);
        }
    }
}

testConnections();
