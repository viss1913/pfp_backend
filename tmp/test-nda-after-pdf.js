require('dotenv').config();
const { renderHtmlToPdfBuffer } = require('./src/utils/renderHtmlToPdfBuffer');
const emailService = require('./src/services/emailService');

const html =
    '<!doctype html><html><body style="font-family:Arial;padding:40px"><h1>NDA test</h1><p>After puppeteer</p></body></html>';

(async () => {
    console.log('puppeteer start');
    const pdf = await renderHtmlToPdfBuffer(html);
    console.log('pdf bytes', pdf.length);
    const agent = { id: 1, email: 'vissarovav@gmail.com', email_corp: 'vissarovav' };
    const r = await emailService.sendNdaPdfEmail({
        to: process.argv[2] || 'vissarovav@gmail.com',
        clientFullName: 'Тест',
        clientGender: 'male',
        agentFullName: 'Виссаров Александр Владимирович',
        agentEmail: 'vissarovav@gmail.com',
        agentPhone: '+7900',
        pdfBuffer: pdf,
        filename: 'NDA_after_pdf.pdf',
        ndaAgent: agent,
    });
    console.log('ok', r);
})().catch((e) => {
    console.error('fail', e.message || e);
    process.exit(1);
});
