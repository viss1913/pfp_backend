/**
 * HTML file → PDF (A4, print backgrounds) via shared Puppeteer pool.
 * Usage: node scripts/html_file_to_pdf.mjs <input.html> <output.pdf>
 */
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { renderHtmlToPdfBuffer, closeSharedPuppeteerBrowser } = require('../src/utils/renderHtmlToPdfBuffer.js');

const [htmlPath, pdfPath] = process.argv.slice(2);
if (!htmlPath || !pdfPath) {
  console.error('Usage: node scripts/html_file_to_pdf.mjs <input.html> <output.pdf>');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const buf = await renderHtmlToPdfBuffer(html, { preferCssPageSize: true });
fs.writeFileSync(pdfPath, buf);
await closeSharedPuppeteerBrowser();
console.log('Wrote', pdfPath, `(${buf.length} bytes)`);
