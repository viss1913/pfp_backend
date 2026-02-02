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
            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(outputPath);

            // Путь к шрифту с поддержкой кириллицы (Windows)
            const fontPath = 'C:\\Windows\\Fonts\\arial.ttf';
            if (fs.existsSync(fontPath)) {
                doc.font(fontPath);
            }

            doc.pipe(stream);

            // Заголовок
            doc.fontSize(20).text('ОТЧЕТ ПО РАСЧЕТУ СТРАХОВАНИЯ', { align: 'center' });
            doc.moveDown();

            // Продукт
            doc.fontSize(14).text(`Продукт: Домашний уют (СК Абсолют)`, { bold: true });
            doc.moveDown();

            // Таблица лимитов
            doc.fontSize(12).text('Выбранные лимиты страхования:', { underline: true });
            doc.moveDown(0.5);

            const limits = [
                ['Отделка и ремонт:', `${data.limits.finish.toLocaleString('ru-RU')} руб.`],
                ['Движимое имущ.:', `${data.limits.property.toLocaleString('ru-RU')} руб.`],
                ['Гражд. ответств.:', `${data.limits.civil.toLocaleString('ru-RU')} руб.`],
                ['Конструктив:', `${data.limits.constructive.toLocaleString()} руб.`]
            ];

            limits.forEach(([label, value]) => {
                doc.text(`${label} ${value}`);
            });

            doc.moveDown();
            doc.fontSize(16).fillColor('navy').text(`ИТОГОВАЯ ПРЕМИЯ: ${data.total_premium.toLocaleString('ru-RU')} РУБ.`, { bold: true });
            doc.fillColor('black');

            doc.moveDown();
            doc.fontSize(10).text('--- Дополнительная информация ---');
            doc.text(`Общая страховая сумма: ${data.total_limit.toLocaleString('ru-RU')} руб.`);
            doc.text(`Валюта расчета: ${data.currency}`);
            doc.text(`Дата расчета: ${new Date().toLocaleString('ru-RU')}`);

            doc.moveDown();
            doc.fontSize(10).text('Данный расчет является предварительным и не является публичной офертой.', { align: 'center' });

            doc.end();

            stream.on('finish', () => resolve(outputPath));
            stream.on('error', (err) => reject(err));
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateHomeOwnersPdf };
