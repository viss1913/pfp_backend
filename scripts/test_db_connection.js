const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('--- Testing Individual Parameters ---');
    const config = {
        host: 'yamanote.proxy.rlwy.net',
        port: 55948,
        user: 'root',
        password: process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD,
        database: 'railway'
    };

    console.log('Attempting connection with:');
    console.log(`Host: ${config.host}:${config.port}`);
    console.log(`User: ${config.user}`);
    console.log(`Password: ${config.password ? '****' : 'MISSING'}`);
    console.log(`Database: ${config.database}`);

    try {
        const connection = await mysql.createConnection(config);
        console.log('\n✅ SUCCESS: Connected directly using parameters!');
        await connection.end();
    } catch (err) {
        console.error('\n❌ FAILED direct connection:');
        console.error('Code:', err.code);
        console.error('Message:', err.message);

        console.log('\n--- Testing with MYSQL_PUBLIC_URL as fallback ---');
        try {
            const connection = await mysql.createConnection(process.env.MYSQL_PUBLIC_URL);
            console.log('✅ SUCCESS: Connected using MYSQL_PUBLIC_URL!');
            await connection.end();
        } catch (urlErr) {
            console.error('❌ FAILED URL connection:', urlErr.message);
        }
    }
}

testConnection();
