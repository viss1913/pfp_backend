const { injectReportPdfEmbeddedFont } = require('../../utils/reportPdfFonts');
const { buildNdaInnerHtml } = require('./ndaAgreementTextRu');

function escapeHtml(s) {
    if (s == null || s === '') return '—';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * @param {object} opts
 * @param {string} opts.agreementCity
 * @param {string} opts.agreementDateLong
 * @param {string} opts.clientFullName
 * @param {string} opts.clientPhone
 * @param {string} opts.clientEmail
 * @param {string} opts.agentFullName
 * @param {string} opts.agentPhone
 * @param {string} opts.agentEmail
 * @param {string} opts.agentPassportLine
 * @param {string} opts.agentBirthDateLong
 * @param {string} opts.clientBirthDateLong
 * @param {string} opts.signatureDataUri — data:image/...;base64,... или https URL (предпочтительно data URI для Puppeteer)
 * @returns {string} полный HTML документа для PDF
 */
function buildNdaHtml(opts) {
    const inner = buildNdaInnerHtml({
        agreement_city: escapeHtml(opts.agreementCity),
        agreement_date_long: escapeHtml(opts.agreementDateLong),
        client_full_name: escapeHtml(opts.clientFullName),
        client_phone: escapeHtml(opts.clientPhone),
        client_email: escapeHtml(opts.clientEmail),
        client_birth_date_long: escapeHtml(opts.clientBirthDateLong),
        agent_full_name: escapeHtml(opts.agentFullName),
        agent_phone: escapeHtml(opts.agentPhone),
        agent_email: escapeHtml(opts.agentEmail),
        agent_passport_line: escapeHtml(opts.agentPassportLine),
        agent_birth_date_long: escapeHtml(opts.agentBirthDateLong),
    });

    const sigSrc = opts.signatureDataUri || '';
    const signatureBlock = sigSrc
        ? `<div class="nda-signature-block">
  <p class="nda-sign-line"><strong>Консультант (Агент):</strong> ${escapeHtml(opts.agentFullName)}</p>
  <div class="nda-signature-img-wrap">
    <img class="nda-signature-img" src="${escapeAttr(sigSrc)}" alt="Подпись" />
  </div>
</div>`
        : '';

    const clientBlock = `<div class="nda-signature-block nda-signature-block--client">
  <p class="nda-sign-line"><strong>Клиент:</strong> ${escapeHtml(opts.clientFullName)}</p>
  <p class="nda-sign-hint">Подпись / печать при наличии: _____________________</p>
</div>`;

    const doc = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    html { font-size: 11pt; }
    body {
      margin: 0;
      padding: 0;
      color: #1a1a1a;
      line-height: 1.45;
    }
    .nda-wrap { max-width: 100%; }
    .nda-title {
      font-size: 16pt;
      font-weight: 700;
      text-align: center;
      margin: 0 0 1em;
      line-height: 1.25;
    }
    .nda-preamble { text-align: right; margin-bottom: 1.2em; }
    h2 {
      font-size: 12pt;
      font-weight: 700;
      margin: 1.2em 0 0.5em;
      page-break-after: avoid;
    }
    p { margin: 0 0 0.65em; }
    ul { margin: 0 0 0.65em; padding-left: 1.4em; }
    .nda-parties {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 10.5pt;
      page-break-inside: avoid;
    }
    .nda-parties th {
      text-align: left;
      background: #f0f2f7;
      padding: 8px 10px;
      border: 1px solid #cfd6e4;
    }
    .nda-parties td {
      padding: 6px 10px;
      border: 1px solid #dfe4ee;
      vertical-align: top;
    }
    .nda-parties td:first-child {
      width: 28%;
      color: #555;
      font-weight: 600;
    }
    .nda-signature-block {
      margin-top: 2em;
      page-break-inside: avoid;
    }
    .nda-signature-block--client { margin-top: 1.5em; }
    .nda-sign-line { margin-bottom: 0.5em; }
    .nda-sign-hint { color: #666; font-size: 10pt; margin-top: 0.5em; }
    .nda-signature-img-wrap { margin-top: 0.3em; }
    .nda-signature-img {
      max-height: 72px;
      max-width: 220px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="nda-wrap">
    ${inner}
    ${signatureBlock}
    ${clientBlock}
  </div>
</body>
</html>`;

    return injectReportPdfEmbeddedFont(doc);
}

module.exports = {
    buildNdaHtml,
    escapeHtml,
};
