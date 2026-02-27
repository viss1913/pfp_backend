const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Путь к шрифтам только от расположения этого файла (на Railway cwd может быть другой)
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');
const FONT_NAMES = ['PTSans-Regular.ttf', 'DejaVuSans.ttf', 'Roboto-Regular.ttf'];

function getCyrillicFontPath() {
    for (const name of FONT_NAMES) {
        const p = path.join(FONTS_DIR, name);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

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
            const fontPath = getCyrillicFontPath();
            if (!fontPath) {
                const tried = FONT_NAMES.map(n => path.join(FONTS_DIR, n)).join(', ');
                const err = new Error(`[PDF] Кириллический шрифт не найден. Проверено: ${tried}. Убедись, что папка assets/fonts задеплоена на Railway.`);
                console.error(err.message);
                return reject(err);
            }
            console.log(`[PDF] Using font: ${fontPath}`);

            const doc = new PDFDocument({ margin: 0 });
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            const setFont = () => doc.font(fontPath);
            setFont();

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
                    setFont();
                    doc.fillOpacity(1).fill('white')
                        .fontSize(24).text('СТРАХОВОЙ ПОЛИС', 50, 40)
                        .fontSize(14).text('Расчёт по программам', 50, 75)
                        .fontSize(10).text(`№ расчета: HO-${Date.now().toString().slice(-6)}`, 50, 95);
                    currentY = 180;
                } else {
                    currentY += 35;
                }

                setFont();
                doc.fill('black').fontSize(14).text(name, contentX, currentY);
                currentY += 28;

                LIMIT_LABELS.forEach(l => {
                    const value = limits[l.key] != null ? limits[l.key] : 0;
                    doc.rect(contentX, currentY, 512, 36).fill('#f5f5f5');
                    setFont();
                    doc.fill('#333').fontSize(10).text(l.label, contentX + 12, currentY + 12);
                    doc.fill('#1a237e').fontSize(11).text(`${Number(value).toLocaleString('ru-RU')} ₽`, contentX + 350, currentY + 12, { width: 150, align: 'right' });
                    currentY += 40;
                });

                currentY += 12;
                doc.rect(contentX, currentY, 512, 48).fill('#e8eaf6');
                setFont();
                doc.fill('#1a237e').fontSize(12).text('Итого премия:', contentX + 20, currentY + 16);
                doc.fontSize(16).text(`${Number(totalPremium).toLocaleString('ru-RU')} ₽`, contentX + 350, currentY + 14, { width: 150, align: 'right' });
                currentY += 55;
            }

            currentY = Math.max(currentY, 720);
            setFont();
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
