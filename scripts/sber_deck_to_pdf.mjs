/**
 * 16:9 deck HTML → PDF (one slide per page).
 * Usage: node scripts/sber_deck_to_pdf.mjs <input.html> <output.pdf>
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const { getDefaultExecutablePath, closeSharedPuppeteerBrowser: closeBrowser } = require('../src/utils/renderHtmlToPdfBuffer.js');

const [htmlPath, pdfPath] = process.argv.slice(2);
if (!htmlPath || !pdfPath) {
  console.error('Usage: node scripts/sber_deck_to_pdf.mjs <input.html> <output.pdf>');
  process.exit(1);
}

const dir = path.dirname(path.resolve(htmlPath));
let html = fs.readFileSync(htmlPath, 'utf8');

// Inline CSS
const cssLink = html.match(/<link[^>]+href=["']([^"']+\.css)["']/i);
if (cssLink) {
  const cssPath = path.resolve(dir, cssLink[1]);
  const css = fs.readFileSync(cssPath, 'utf8');
  html = html.replace(/<link[^>]+href=["'][^"']+\.css["'][^>]*>/i, `<style>\n${css}\n</style>`);
}

// Absolute paths for local images (../assets, assets/, screens/, etc.)
html = html.replace(
  /src=["'](?!https?:|data:)([^"']+)["']/g,
  (_, rel) => `src="${pathToFileURL(path.resolve(dir, rel)).href}"`
);

// Hide nav in PDF bundle
html = html.replace(/<nav class="deck-nav">[\s\S]*?<\/nav>/i, '');

const executablePath = getDefaultExecutablePath();
const launchOptions = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
};
if (executablePath) launchOptions.executablePath = executablePath;

const browser = await puppeteer.launch(launchOptions);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  const buf = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: 1,
  });
  fs.writeFileSync(pdfPath, buf);
  console.log('Wrote', pdfPath, `(${buf.length} bytes)`);
} finally {
  await browser.close();
  await closeBrowser();
}
