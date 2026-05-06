/**
 * Генерирует усечённые WOFF2 для PDF (кириллица + латиница + типовые знаки + ₽).
 * Запуск: node scripts/generate_pdf_dejavu_subsets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import subsetFont from 'subset-font';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

function buildGlyphCoverageText() {
    let s = '';
    for (let cp = 0x20; cp <= 0x7e; cp += 1) s += String.fromCodePoint(cp);
    for (let cp = 0xa0; cp <= 0xff; cp += 1) s += String.fromCodePoint(cp);
    for (let cp = 0x400; cp <= 0x4ff; cp += 1) s += String.fromCodePoint(cp);
    for (let cp = 0x500; cp <= 0x52f; cp += 1) s += String.fromCodePoint(cp);
    s += '\u20bd\u2116\u2013\u2014\u201c\u201d\u201e\u00ab\u00bb\u2026';
    return s;
}

async function main() {
    const normalPath = path.join(REPO, 'assets', 'fonts', 'DejaVuSans.ttf');
    const boldPath = path.join(REPO, 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
    const outN = path.join(REPO, 'assets', 'fonts', 'DejaVuSans-PdfSubset.woff2');
    const outB = path.join(REPO, 'assets', 'fonts', 'DejaVuSans-Bold-PdfSubset.woff2');
    const text = buildGlyphCoverageText();
    const nBuf = fs.readFileSync(normalPath);
    const bBuf = fs.readFileSync(boldPath);
    const nSub = await subsetFont(nBuf, text, { targetFormat: 'woff2' });
    const bSub = await subsetFont(bBuf, text, { targetFormat: 'woff2' });
    fs.writeFileSync(outN, nSub);
    fs.writeFileSync(outB, bSub);
    console.log('DejaVuSans-PdfSubset.woff2', nSub.length, 'bytes');
    console.log('DejaVuSans-Bold-PdfSubset.woff2', bSub.length, 'bytes');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
