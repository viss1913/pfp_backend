/**
 * Собирает демо-HTML NDA с тестовыми данными (как в production buildNdaHtml).
 * Запуск: node scripts/generate_nda_preview_html.js
 * Файл: src/reports/nda/nda-preview-sample.html
 */
const fs = require('fs');
const path = require('path');

// Для превью блоков оферты / политики (как на проде через env)
process.env.NDA_PUBLIC_OFFER_URL = process.env.NDA_PUBLIC_OFFER_URL || 'https://example.com/public-offer';
process.env.NDA_PRIVACY_POLICY_URL = process.env.NDA_PRIVACY_POLICY_URL || '';

const { buildNdaHtml } = require('../src/reports/nda/buildNdaHtml');

// Условная «подпись» для предпросмотра (SVG, не тянет сеть)
const DEMO_SIGNATURE_SVG = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70">
  <path d="M8 45 Q40 20 80 38 T150 32 L210 28" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
  <text x="8" y="62" font-size="9" fill="#666" font-family="sans-serif">(образец подписи)</text>
</svg>`
);
const SIGNATURE_DATA_URI = `data:image/svg+xml;charset=utf-8,${DEMO_SIGNATURE_SVG}`;

const OUT_PATH = path.join(__dirname, '..', 'src', 'reports', 'nda', 'nda-preview-sample.html');

const html = buildNdaHtml({
    agreementCity: 'Ростов-на-Дону',
    agreementDateLong: '3 февраля 2026 г.',
    clientFullName: 'Иванов Сергей Петрович',
    clientBirthDateLong: '12 июня 1985 г.',
    clientPhone: '+7 (900) 123-45-67',
    clientEmail: 'client.demo@example.com',
    agentFullName: 'Петрова Анна Ивановна',
    agentPhone: '+7 (900) 999-88-77',
    agentEmail: 'agent.demo@bank-future.com',
    agentPassportLine: 'серия 45 00, № 123456',
    agentBirthDateLong: '15 марта 1990 г.',
    signatureDataUri: SIGNATURE_DATA_URI,
});

fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log(`OK: ${OUT_PATH}`);
console.log('Открой файл в браузере (Chrome/Edge).');
