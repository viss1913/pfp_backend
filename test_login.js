const authService = require('./src/services/authService');

async function testLogin() {
    try {
        const email = 'vissarovav@bank-future.com';
        const password = '1qazXSW@';

        console.log(`Attempting login for ${email}...`);
        const result = await authService.login(email, password);
        console.log('Login successful!', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Login failed:', err);
    } finally {
        process.exit(0);
    }
}

testLogin();
