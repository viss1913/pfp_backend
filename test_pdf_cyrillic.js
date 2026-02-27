const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument();
const fontPath = path.join(process.cwd(), 'assets/fonts/DejaVuSans.ttf');

console.log('Font exists:', fs.existsSync(fontPath));
doc.font(fontPath);
console.log('Font loaded OK');

const out = fs.createWriteStream('test_cyrillic.pdf');
doc.pipe(out);

doc.fontSize(24).text('СТРАХОВОЙ ПОЛИС', 50, 50);
doc.fontSize(14).text('Расчёт по программам', 50, 100);
doc.fontSize(12).text('Внутренняя отделка и ремонт: 500 000 ₽', 50, 140);
doc.fontSize(12).text('Движимое имущество: 1 000 000 ₽', 50, 170);

doc.end();
out.on('finish', () => {
    console.log('PDF created, size:', fs.statSync('test_cyrillic.pdf').size);
    console.log('Open test_cyrillic.pdf to verify Cyrillic text');
});
