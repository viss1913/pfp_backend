const db = require('./src/config/database');

async function checkUser() {
    try {
        const email = 'vissarovav@bank-future.com';
        const user = await db('users').where({ email }).first();
        console.log('User status:', JSON.stringify(user, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkUser();
