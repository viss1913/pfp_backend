/**
 * Полный контур NDA как в проде: подпись + buildNdaHtml + puppeteer + Resend.
 * Usage: node tmp/test-full-nda-deliver.js [email]
 */
require('dotenv').config();
const ndaService = require('../src/services/ndaService');

const to = process.argv[2] || 'vissarovav@gmail.com';

ndaService
    .generateAndSendNdaStandalone({
        agentUserId: 1,
        projectId: 2,
        clientEmail: to,
        clientFullName: 'Тестов Тест Тестович',
        clientPhone: '+79001234567',
        clientBirthDate: '1990-05-15',
        clientGender: 'male',
    })
    .then((r) => {
        console.log('[full nda ok]', r.message_id, r.client_email);
    })
    .catch((e) => {
        console.error('[full nda fail]', e.status, e.message || e);
        process.exit(1);
    });
