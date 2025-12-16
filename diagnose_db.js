require('dotenv').config({ override: true });
const mysql = require('mysql2/promise');

async function testConnection() {
    console.log('--- Environment Variables Check ---');
    console.log('MYSQL_PUBLIC_URL:', process.env.MYSQL_PUBLIC_URL ? '✅ Set' : '❌ Not Set');
    console.log('MYSQL_URL:', process.env.MYSQL_URL ? 'Set' : 'Not Set');
    console.log('-----------------------------------');

    let config = null;

    if (process.env.MYSQL_PUBLIC_URL) {
        console.log('Connecting via MYSQL_PUBLIC_URL...');
        try {
            const url = new URL(process.env.MYSQL_PUBLIC_URL);
            config = {
                host: url.hostname,
                port: Number(url.port) || 3306,
                user: url.username,
                password: url.password,
                database: url.pathname.slice(1)
            };
            console.log(`Target: ${config.user}@${config.host}:${config.port}/${config.database}`);
        } catch (e) { console.error('Error parsing MYSQL_PUBLIC_URL', e); }
    } else if (process.env.MYSQL_URL) {
        console.log('Connecting via MYSQL_URL...');
        try {
            const url = new URL(process.env.MYSQL_URL);
            config = {
                host: url.hostname,
                port: Number(url.port) || 3306,
                user: url.username,
                password: url.password,
                database: url.pathname.slice(1)
            };
        } catch (e) { console.error('Error parsing MYSQL_URL', e); }
    } else {
        console.log('Fallback to individual vars...');
        // ... (existing fallback logic if needed, but we focus on URL now)
    }

    if (!config) {
        console.error('❌ No valid configuration found in .env');
        return;
    }

    try {
        const connection = await mysql.createConnection(config);
        console.log('✅ Connection Successful!');
        await connection.end();
    } catch (error) {
        console.error('❌ Connection Failed:', error.message);
    }
}

testConnection();
