require('dotenv').config();
const emailService = require('./src/services/emailService');

const pdfBuffer = Buffer.from('%PDF-1.4 minimal test');
const agent = { id: 1, email: 'vissarovav@gmail.com', email_corp: 'vissarovav' };

emailService
    .sendNdaPdfEmail({
        to: process.argv[2] || 'vissarovav@gmail.com',
        clientFullName: 'Тест Тестов',
        clientGender: 'male',
        agentFullName: 'Виссаров Александр Владимирович',
        agentEmail: 'vissarovav@gmail.com',
        agentPhone: '+797737575301',
        pdfBuffer,
        filename: 'NDA_test.pdf',
        ndaAgent: agent,
    })
    .then((r) => console.log('[nda ok]', JSON.stringify(r)))
    .catch((e) => console.log('[nda fail]', e.status, e.message || e));
