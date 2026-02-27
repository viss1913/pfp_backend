const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LIMIT_LABELS = [
    { key: 'finish', label: 'Внутренняя отделка и ремонт' },
    { key: 'property', label: 'Движимое имущество' },
    { key: 'civil', label: 'Гражданская ответственность' },
    { key: 'constructive', label: 'Конструктивные элементы' }
];

/**
 * Генерирует PDF: одна программа (data.limits) или все из data.calculations
 * @param {Object} data { calculations: [{ product_name, limits, total_premium, ... }] } или один объект расчёта
 * @param {String} outputPath Путь для сохранения файла
 */
async function generateHomeOwnersPdf(data, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 0 });
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // Приоритет: шрифты с полной поддержкой кириллицы
            const fontCandidates = [
                path.join(__dirname, '../../assets/fonts/PTSans-Regular.ttf'),
                path.join(process.cwd(), 'assets/fonts/PTSans-Regular.ttf'),
                path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf'),
                path.join(process.cwd(), 'assets/fonts/DejaVuSans.ttf'),
                path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf'),
                path.join(process.cwd(), 'assets/fonts/Roboto-Regular.ttf')
            ];
            const fontPath = fontCandidates.find(p => fs.existsSync(p));
            if (fontPath) {
                console.log(`[PDF] Using font: ${fontPath}`);
                doc.font(fontPath);
            } else {
                console.warn(`[PDF] Font NOT found! __dirname=${__dirname}, cwd=${process.cwd()}`);
            }

            const contentX = 50;
            let currentY = 0;

            // Список программ: один блок или массив
            const list = data.calculations && Array.isArray(data.calculations)
                ? data.calculations
                : [data];

            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                const name = item.product_name || `Программа ${i + 1}`;
                const limits = item.limits || {};
                const totalPremium = item.total_premium != null ? item.total_premium : 0;

                if (i === 0) {
                    const heroPath = path.join(__dirname, '../../assets/images/home_insurance_hero.png');
                    if (fs.existsSync(heroPath)) {
                        doc.image(heroPath, 0, 0, { width: 612 });
                        doc.rect(0, 0, 612, 150).fillOpacity(0.3).fill('black');
                    } else {
                        doc.rect(0, 0, 612, 150).fill('#1a237e');
                    }
                    doc.fillOpacity(1).fill('white')
                        .fontSize(24).text('СТРАХОВОЙ ПОЛИС', 50, 40)
                        .fontSize(14).text('Расчёт по программам', 50, 75)
                        .fontSize(10).text(`№ расчета: HO-${Date.now().toString().slice(-6)}`, 50, 95);
                    currentY = 180;
                } else {
                    currentY += 35;
                }

                doc.fill('black').fontSize(14).text(name, contentX, currentY);
                currentY += 28;

                LIMIT_LABELS.forEach(l => {
                    const value = limits[l.key] != null ? limits[l.key] : 0;
                    doc.rect(contentX, currentY, 512, 36).fill('#f5f5f5');
                    doc.fill('#333').fontSize(10).text(l.label, contentX + 12, currentY + 12);
                    doc.fill('#1a237e').fontSize(11).text(`${Number(value).toLocaleString('ru-RU')} ₽`, contentX + 350, currentY + 12, { width: 150, align: 'right' });
                    currentY += 40;
                });

                currentY += 12;
                doc.rect(contentX, currentY, 512, 48).fill('#e8eaf6');
                doc.fill('#1a237e').fontSize(12).text('Итого премия:', contentX + 20, currentY + 16);
                doc.fontSize(16).text(`${Number(totalPremium).toLocaleString('ru-RU')} ₽`, contentX + 350, currentY + 14, { width: 150, align: 'right' });
                currentY += 55;
            }

            currentY = Math.max(currentY, 720);
            doc.fill('#666').fontSize(9).text(
                'Расчет произведен на основании стандартных тарифов. Данное предложение не является публичной офертой. Для оформления полиса свяжитесь с вашим финансовым консультантом.',
                contentX, currentY, { width: 512, align: 'center' }
            );

            doc.end();

            stream.on('finish', () => resolve(outputPath));
            stream.on('error', (err) => reject(err));
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateHomeOwnersPdf };
