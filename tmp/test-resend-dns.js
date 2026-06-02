const dns = require('dns').promises;
const https = require('https');

(async () => {
    try {
        const l = await dns.lookup('api.resend.com', { all: true });
        console.log('lookup', JSON.stringify(l));
    } catch (e) {
        console.log('lookup ERR', e.message);
    }

    await new Promise((resolve) => {
        const req = https.get('https://api.resend.com', (r) => {
            console.log('https status', r.statusCode);
            resolve();
        });
        req.on('error', (e) => {
            console.log('https ERR', e.message);
            resolve();
        });
        req.setTimeout(10000, () => {
            req.destroy();
            console.log('https TIMEOUT');
            resolve();
        });
    });

    require('dotenv').config();
    const emailService = require('./src/services/emailService');
    try {
        const r = await emailService.sendVerificationCode(
            process.argv[2] || 'vissarovav@gmail.com',
            '999999',
            { purpose: 'agent' }
        );
        console.log('send ok', JSON.stringify(r));
    } catch (e) {
        console.log('send FAIL', e.message || e);
    }
})();
