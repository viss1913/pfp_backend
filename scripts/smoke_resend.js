/**
 * Проверка отправки через Resend (тот же путь, что и sendVerificationCode).
 * Usage: node scripts/smoke_resend.js you@example.com
 *    или: npm run smoke:resend -- you@example.com
 */
require('dotenv').config();
const emailService = require('../src/services/emailService');

const to = process.argv[2] || process.env.TEST_EMAIL;
if (!to) {
    console.error('Укажи email: node scripts/smoke_resend.js you@example.com');
    process.exit(1);
}

const code = String(Math.floor(100000 + Math.random() * 900000));

emailService
    .sendVerificationCode(to, code)
    .then((r) => {
        console.log('[smoke_resend] отправлено, ответ:', r);
    })
    .catch((e) => {
        console.error('[smoke_resend] ошибка:', e.status || e, e.message || '');
        process.exit(1);
    });
