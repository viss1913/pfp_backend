const mysql = require('mysql2/promise');
require('dotenv').config();

async function debug() {
    process.stdout.write('\x1Bc'); // Clear console
    console.log('=== DATABASE DEBUGGER V2 ===\n');

    // 1. Clean environment variables
    const getVar = (name) => (process.env[name] || '').trim();

    const settings = {
        host: getVar('MYSQL_PUBLIC_URL').split('@')[1]?.split(':')[0] || 'yamanote.proxy.rlwy.net',
        port: parseInt(getVar('MYSQL_PUBLIC_URL').split(':').pop()?.split('/')[0]) || 55948,
        user: getVar('MYSQLUSER') || 'root',
        password: getVar('MYSQLPASSWORD') || getVar('MYSQL_ROOT_PASSWORD'),
        database: getVar('MYSQLDATABASE') || 'railway'
    };

    console.log('Cleaned Settings:');
    console.log(`- Host: ${settings.host}`);
    console.log(`- Port: ${settings.port}`);
    console.log(`- User: ${settings.user}`);
    console.log(`- Pass length: ${settings.password.length} chars`);
    console.log(`- DB: ${settings.database}`);
    console.log('----------------------------\n');

    // Test 1: Full connection
    console.log('Test 1: Connecting with full parameters...');
    try {
        const conn = await mysql.createConnection(settings);
        console.log('✅ SUCCESS: Full connection established!');
        await conn.end();
    } catch (e) {
        console.error('❌ FAILED:', e.message);
    }

    // Test 2: Without database name
    console.log('\nTest 2: Connecting WITHOUT database name...');
    try {
        const { database, ...noDbSettings } = settings;
        const conn = await mysql.createConnection(noDbSettings);
        console.log('✅ SUCCESS: Connected to server (Server IS ALIVE)');
        await conn.end();
    } catch (e) {
        console.error('❌ FAILED:', e.message);
    }

    // Test 3: Public URL directly
    console.log('\nTest 3: Connecting via raw process.env.MYSQL_PUBLIC_URL...');
    try {
        const conn = await mysql.createConnection(process.env.MYSQL_PUBLIC_URL.trim());
        console.log('✅ SUCCESS: Raw URL worked!');
        await conn.end();
    } catch (e) {
        console.error('❌ FAILED:', e.message);
    }
}

debug();
