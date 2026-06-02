'use strict';
const emailService = require('../src/services/emailService');
const to = process.argv[2] || 'vissarovav@gmail.com';
const code = String(Math.floor(100000 + Math.random() * 900000));

emailService
    .sendVerificationCode(to, code)
    .then((r) => {
        console.log('[immers-smoke] OK', r);
        process.exit(0);
    })
    .catch((e) => {
        console.error('[immers-smoke] FAIL', e.message || e);
        process.exit(1);
    });
