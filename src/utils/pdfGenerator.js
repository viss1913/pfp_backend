const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Путь к шрифтам от расположения этого файла
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');
const FONT_NAMES = ['PTSans-Regular.ttf', 'DejaVuSans.ttf', 'Roboto-Regular.ttf'];

// CDN-ссылка на DejaVuSans (если локальный шрифт не найден — скачаем)
const FALLBACK_FONT_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';
const FALLBACK_FONT_CACHE = path.join('/tmp', 'DejaVuSans_cached.ttf');

function getCyrillicFontPath() {
    for (const name of FONT_NAMES) {
        const p = path.join(FONTS_DIR, name);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * Скачивает шрифт с CDN и сохраняет в /tmp для повторного использования
 */
function downloadFont(url, destPath) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const proto = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);

        proto.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Следуем редиректу
                file.close();
                return resolve(downloadFont(response.headers.location, destPath));
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => { });
                return reject(new Error(`[PDF] Font download failed: HTTP ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(destPath));
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

/**
 * Возвращает путь к кириллическому шрифту.
 * Сначала ищет локально, если нет — скачивает с CDN один раз в /tmp.
 */
async function resolveFontPath() {
    // 1. Пробуем локальный шрифт
    const local = getCyrillicFontPath();
    if (local) {
        console.log(`[PDF] Using local font: ${local}`);
        return local;
    }

    // 2. Проверяем кеш в /tmp
    if (fs.existsSync(FALLBACK_FONT_CACHE)) {
        console.log(`[PDF] Using cached font: ${FALLBACK_FONT_CACHE}`);
        return FALLBACK_FONT_CACHE;
    }

    // 3. Скачиваем с CDN
    console.log(`[PDF] Local fonts not found. Downloading from CDN: ${FALLBACK_FONT_URL}`);
    await downloadFont(FALLBACK_FONT_URL, FALLBACK_FONT_CACHE);
    console.log(`[PDF] Font downloaded and cached: ${FALLBACK_FONT_CACHE}`);
    return FALLBACK_FONT_CACHE;
}

const LIMIT_LABELS = [
    { key: 'finish', label: 'Внутренняя отделка и ремонт' },
    { key: 'property', label: 'Движимое имущество' },
    { key: 'civil', label: 'Гражданская ответственность' },
    { key: 'constructive', label: 'Конструктивные элементы' }
];

/**
 * Генерирует PDF: одна программа (data.limits) или все из data.calculations
 * @param {Object} data { calculations: [{ product_name, limits, total_premium, ... }] }
 * @param {String} outputPath Путь для сохранения файла
 */
async function generateHomeOwnersPdf(data, outputPath) {
    const fontPath = await resolveFontPath();

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 0 });
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // ВАЖНО: после любого .fill() PDFKit сбрасывает шрифт на дефолтный Helvetica.
            // setFont() вызываем КАЖДЫЙ РАЗ перед .text()
            const setFont = (size) => {
                doc.font(fontPath);
                if (size) doc.fontSize(size);
                return doc;
            };

            const contentX = 50;
            let currentY = 0;

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

                    // После fill — восстанавливаем шрифт перед каждым text()
                    setFont(24).fillOpacity(1).fill('white').text('СТРАХОВОЙ ПОЛИС', 50, 40);
                    setFont(14).fill('white').text('Расчёт по программам', 50, 75);
                    setFont(10).fill('white').text(`\u2116 расчета: HO-${Date.now().toString().slice(-6)}`, 50, 95);
                    currentY = 180;
                } else {
                    currentY += 35;
                }

                setFont(14).fill('black').text(name, contentX, currentY);
                currentY += 28;

                LIMIT_LABELS.forEach(l => {
                    const value = limits[l.key] != null ? limits[l.key] : 0;

                    doc.rect(contentX, currentY, 512, 36).fill('#f5f5f5');

                    // После fill — ОБЯЗАТЕЛЬНО восстанавливаем шрифт!
                    setFont(10).fill('#333').text(l.label, contentX + 12, currentY + 12);
                    setFont(11).fill('#1a237e').text(
                        `${Number(value).toLocaleString('ru-RU')} \u20BD`,
                        contentX + 350, currentY + 12,
                        { width: 150, align: 'right' }
                    );
                    currentY += 40;
                });

                currentY += 12;
                doc.rect(contentX, currentY, 512, 48).fill('#e8eaf6');

                // После fill — ОБЯЗАТЕЛЬНО восстанавливаем шрифт!
                setFont(12).fill('#1a237e').text('Итого премия:', contentX + 20, currentY + 16);
                setFont(16).fill('#1a237e').text(
                    `${Number(totalPremium).toLocaleString('ru-RU')} \u20BD`,
                    contentX + 350, currentY + 14,
                    { width: 150, align: 'right' }
                );
                currentY += 55;
            }

            currentY = Math.max(currentY, 720);
            setFont(9).fill('#666').text(
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
