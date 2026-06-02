require('dotenv').config();
const emailService = require('./src/services/emailService');
const to = process.argv[2] || 'vissarovav@gmail.com';
emailService
    .sendVerificationCode(to, '123456', { purpose: 'agent' })
    .then((r) => console.log('[ok]', JSON.stringify(r)))
    .catch((e) => {
        console.error('[fail]', e.message || e);
        process.exit(1);
    });
