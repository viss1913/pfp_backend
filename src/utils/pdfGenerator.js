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

            // ВАЖНО: после любого .fill() PDFKit сбрасывает шрифт на дефолтный Helvetica.
            // Поэтому setFont() вызываем КАЖДЫЙ РАЗ перед .text()
            const setFont = (size) => {
                doc.font(fontPath);
                if (size) doc.fontSize(size);
                return doc;
            };

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
                        // После .fill() — обязательно восстанавливаем шрифт!
                        doc.rect(0, 0, 612, 150).fillOpacity(0.3).fill('black');
                    } else {
                        doc.rect(0, 0, 612, 150).fill('#1a237e');
                    }

                    // Восстанавливаем шрифт после fill, fillOpacity обнуляем
                    setFont(24).fillOpacity(1).fill('white').text('СТРАХОВОЙ \u041f\u041e\u041b\u0418\u0421', 50, 40);
                    setFont(14).fill('white').text('\u0420\u0430\u0441\u0447\u0451\u0442 \u043f\u043e \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430\u043c', 50, 75);
                    setFont(10).fill('white').text(`\u2116 \u0440\u0430\u0441\u0447\u0435\u0442\u0430: HO-${Date.now().toString().slice(-6)}`, 50, 95);
                    currentY = 180;
                } else {
                    currentY += 35;
                }

                // Заголовок программы — шрифт восстанавливаем перед text
                setFont(14).fill('black').text(name, contentX, currentY);
                currentY += 28;

                LIMIT_LABELS.forEach(l => {
                    const value = limits[l.key] != null ? limits[l.key] : 0;

                    // Фон ячейки
                    doc.rect(contentX, currentY, 512, 36).fill('#f5f5f5');

                    // После fill — ОБЯЗАТЕЛЬНО восстанавливаем шрифт перед text!
                    setFont(10).fill('#333').text(l.label, contentX + 12, currentY + 12);
                    setFont(11).fill('#1a237e').text(
                        `${Number(value).toLocaleString('ru-RU')} \u20BD`,
                        contentX + 350, currentY + 12,
                        { width: 150, align: 'right' }
                    );
                    currentY += 40;
                });

                // Итоговая строка
                currentY += 12;
                doc.rect(contentX, currentY, 512, 48).fill('#e8eaf6');

                // После fill — ОБЯЗАТЕЛЬНО восстанавливаем шрифт!
                setFont(12).fill('#1a237e').text('\u0418\u0442\u043e\u0433\u043e \u043f\u0440\u0435\u043c\u0438\u044f:', contentX + 20, currentY + 16);
                setFont(16).fill('#1a237e').text(
                    `${Number(totalPremium).toLocaleString('ru-RU')} \u20BD`,
                    contentX + 350, currentY + 14,
                    { width: 150, align: 'right' }
                );
                currentY += 55;
            }

            currentY = Math.max(currentY, 720);
            setFont(9).fill('#666').text(
                '\u0420\u0430\u0441\u0447\u0435\u0442 \u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d \u043d\u0430 \u043e\u0441\u043d\u043e\u0432\u0430\u043d\u0438\u0438 \u0441\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u044b\u0445 \u0442\u0430\u0440\u0438\u0444\u043e\u0432. \u0414\u0430\u043d\u043d\u043e\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0435 \u044f\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u043e\u0439 \u043e\u0444\u0435\u0440\u0442\u043e\u0439. \u0414\u043b\u044f \u043e\u0444\u043e\u0440\u043c\u043b\u0435\u043d\u0438\u044f \u043f\u043e\u043b\u0438\u0441\u0430 \u0441\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c \u0441 \u0432\u0430\u0448\u0438\u043c \u0444\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u044b\u043c \u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0430\u043d\u0442\u043e\u043c.',
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
