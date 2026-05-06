/**
 * Оценка размера пейлоада PDF (без поднятия БД): длина merged HTML и оценка шрифта.
 * node scripts/measure_pdf_payload_estimate.js
 */
const fs = require('fs');
const path = require('path');
const { buildReportPdfFontInjectionHtml } = require('../src/utils/reportPdfFonts');

function mb(n) {
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
    const fontHtml = buildReportPdfFontInjectionHtml();
    console.log('Font injection block:', mb(Buffer.byteLength(fontHtml, 'utf8')));
    const subsetN = path.join(__dirname, '../assets/fonts/DejaVuSans-PdfSubset.woff2');
    const subsetB = path.join(__dirname, '../assets/fonts/DejaVuSans-Bold-PdfSubset.woff2');
    if (fs.existsSync(subsetN)) {
        console.log('DejaVuSans-PdfSubset.woff2 on disk:', mb(fs.statSync(subsetN).size));
    }
    if (fs.existsSync(subsetB)) {
        console.log('DejaVuSans-Bold-PdfSubset.woff2 on disk:', mb(fs.statSync(subsetB).size));
    }
}

main();
