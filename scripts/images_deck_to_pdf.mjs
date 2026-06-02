/**
 * Images directory -> PDF deck (A4 landscape, one image per page).
 * Usage: node scripts/images_deck_to_pdf.mjs <images-dir> <output.pdf>
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  renderHtmlToPdfBuffer,
  closeSharedPuppeteerBrowser,
} = require('../src/utils/renderHtmlToPdfBuffer.js');

const [imagesDirArg, pdfPathArg] = process.argv.slice(2);
if (!imagesDirArg || !pdfPathArg) {
  console.error('Usage: node scripts/images_deck_to_pdf.mjs <images-dir> <output.pdf>');
  process.exit(1);
}

const imagesDir = path.resolve(imagesDirArg);
const pdfPath = path.resolve(pdfPathArg);

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sortByNumericBasename(a, b) {
  const aName = path.parse(a).name;
  const bName = path.parse(b).name;
  const aNum = Number(aName);
  const bNum = Number(bName);
  const aIsNum = Number.isFinite(aNum) && aName.trim() !== '';
  const bIsNum = Number.isFinite(bNum) && bName.trim() !== '';

  if (aIsNum && bIsNum) return aNum - bNum;
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return aName.localeCompare(bName, 'ru', { numeric: true, sensitivity: 'base' });
}

const imageFiles = fs
  .readdirSync(imagesDir)
  .filter((file) => MIME_BY_EXT[path.extname(file).toLowerCase()])
  .sort(sortByNumericBasename);

if (!imageFiles.length) {
  console.error(`No supported images found in ${imagesDir}`);
  process.exit(1);
}

const slidesHtml = imageFiles
  .map((file, index) => {
    const ext = path.extname(file).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    const filePath = path.join(imagesDir, file);
    const base64 = fs.readFileSync(filePath).toString('base64');
    return `
    <section class="slide">
      <div class="image-frame">
        <img src="data:${mime};base64,${base64}" alt="Slide ${index + 1}" />
      </div>
    </section>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Images Deck</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: "Segoe UI", Arial, sans-serif; }
    .deck { display: grid; gap: 0; }
    .slide {
      width: 297mm;
      height: 210mm;
      padding: 3mm;
      background: #fff;
      display: flex;
      page-break-after: always;
      overflow: hidden;
    }
    .slide:last-child { page-break-after: auto; }
    .image-frame {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fff;
    }
    .image-frame img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <main class="deck">
${slidesHtml}
  </main>
</body>
</html>`;

const pdf = await renderHtmlToPdfBuffer(html, { preferCssPageSize: true });
fs.writeFileSync(pdfPath, pdf);
await closeSharedPuppeteerBrowser();

console.log('Wrote', pdfPath, `(${pdf.length} bytes, ${imageFiles.length} slides)`);
