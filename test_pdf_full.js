const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 0 });
const out = fs.createWriteStream('test_full.pdf');
doc.pipe(out);

const fontPath = path.join(process.cwd(), 'assets/fonts/DejaVuSans.ttf');
console.log('Font exists:', fs.existsSync(fontPath));
doc.font(fontPath);

const contentX = 50;
let currentY = 0;

// Replicate exact pdfGenerator.js logic
doc.rect(0, 0, 612, 150).fill('#1a237e');
doc.fillOpacity(1).fill('white')
    .fontSize(24).text('СТРАХОВОЙ ПОЛИС', 50, 40)
    .fontSize(14).text('Расчёт по программам', 50, 75)
    .fontSize(10).text('№ расчета: HO-249541', 50, 95);
currentY = 180;

doc.fill('black').fontSize(14).text('Тестовая Программа', contentX, currentY);
currentY += 28;

const labels = [
    { label: 'Внутренняя отделка и ремонт', value: 500000 },
    { label: 'Движимое имущество', value: 1000000 },
    { label: 'Гражданская ответственность', value: 500000 },
    { label: 'Конструктивные элементы', value: 0 }
];

labels.forEach(l => {
    doc.rect(contentX, currentY, 512, 36).fill('#f5f5f5');
    doc.fill('#333').fontSize(10).text(l.label, contentX + 12, currentY + 12);
    doc.fill('#1a237e').fontSize(11).text(
        `${Number(l.value).toLocaleString('ru-RU')} \u20BD`,
        contentX + 350, currentY + 12, { width: 150, align: 'right' }
    );
    currentY += 40;
});

currentY += 12;
doc.rect(contentX, currentY, 512, 48).fill('#e8eaf6');
doc.fill('#1a237e').fontSize(12).text('Итого премия:', contentX + 20, currentY + 16);
doc.fontSize(16).text(
    `5 250 \u20BD`,
    contentX + 350, currentY + 14, { width: 150, align: 'right' }
);

doc.end();
out.on('finish', () => {
    console.log('PDF created:', fs.statSync('test_full.pdf').size, 'bytes');
    console.log('Open test_full.pdf to check');
});
