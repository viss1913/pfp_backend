process.chdir('/app');
const emailService = require('./src/services/emailService');
const to = process.argv[2] || 'vissarovav@gmail.com';
const code = String(Math.floor(100000 + Math.random() * 900000));
emailService
    .sendVerificationCode(to, code, { purpose: 'agent' })
    .then((r) => console.log('[ok]', r))
    .catch((e) => {
        console.error('[fail]', e.status, e.message || e);
        process.exit(1);
    });
