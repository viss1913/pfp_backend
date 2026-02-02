const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Генерирует PDF-отчет на основе данных расчета
 * @param {Object} data Данные из HomeOwnersCalculator
 * @param {String} outputPath Путь для сохранения файла
 */
async function generateHomeOwnersPdf(data, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 0 }); // Без полей для полноэкранной шапки
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // Шрифты
            const localFontPath = path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf');
            if (fs.existsSync(localFontPath)) doc.font(localFontPath);

            // 1. ШАПКА С КАРТИНКОЙ
            const heroPath = path.join(__dirname, '../../assets/images/home_insurance_hero.png');
            if (fs.existsSync(heroPath)) {
                doc.image(heroPath, 0, 0, { width: 612 }); // Ширина A4
                doc.rect(0, 0, 612, 150).fillOpacity(0.3).fill('black'); // Затемнение для текста
            } else {
                doc.rect(0, 0, 612, 150).fill('#1a237e');
            }

            // Текст в шапке
            doc.fillOpacity(1).fill('white')
                .fontSize(24).text('СТРАХОВОЙ ПОЛИС', 50, 40)
                .fontSize(14).text('Программа «Домашний Уют»', 50, 75)
                .fontSize(10).text(`№ расчета: ${data.id || 'HO-' + Date.now().toString().slice(-6)}`, 50, 95);

            // 2. КОНТЕНТ (возвращаем отступы)
            const contentX = 50;
            let currentY = 180;

            doc.fill('black').fontSize(16).text('Данные расчета', contentX, currentY);
            currentY += 30;

            // Рисуем блоки лимитов
            const limits = [
                { label: 'Внутренняя отделка и ремонт', value: data.limits.finish },
                { label: 'Движимое имущество', value: data.limits.property },
                { label: 'Гражданская ответственность', value: data.limits.civil },
                { label: 'Конструктивные элементы', value: data.limits.constructive }
            ];

            limits.forEach(item => {
                // Серый фон блока
                doc.rect(contentX, currentY, 512, 40).fill('#f5f5f5');
                doc.fill('#333').fontSize(11).text(item.label, contentX + 15, currentY + 14);
                doc.fill('#1a237e').fontSize(12).text(`${item.value.toLocaleString('ru-RU')} ₽`, contentX + 350, currentY + 14, { width: 150, align: 'right' });
                currentY += 45;
            });

            // 3. ИТОГО
            currentY += 20;
            doc.rect(contentX, currentY, 512, 60).fill('#e8eaf6');
            doc.fill('#1a237e').fontSize(14).text('ИТОГОВАЯ СТОИМОСТЬ (ПРЕМИЯ):', contentX + 20, currentY + 22);
            doc.fontSize(18).text(`${data.total_premium.toLocaleString('ru-RU')} ₽`, contentX + 350, currentY + 20, { width: 150, align: 'right' });

            // 4. ПОДВАЛ
            doc.fill('#666').fontSize(9).text(
                'Расчет произведен на основании стандартных тарифов. Данное предложение не является публичной офертой. \nДля оформления полиса свяжитесь с вашим финансовым консультантом.',
                contentX, 750, { width: 512, align: 'center' }
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
