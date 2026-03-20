/**
 * Заливка тестовой картинки в R2 (те же переменные, что для бэка).
 * IMAGE_PATH — опционально, по умолчанию assets/reports/rostech/cover-background.jpg
 * R2_SMOKE_KEEP=1 — не удалять объект после загрузки
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { uploadPublicFile, deleteObjectByKey } = require('../src/utils/r2Client');

async function main() {
    const root = path.join(__dirname, '..');
    const imagePath = process.env.IMAGE_PATH
        ? path.resolve(process.env.IMAGE_PATH)
        : path.join(root, 'assets/reports/rostech/cover-background.jpg');

    if (!fs.existsSync(imagePath)) {
        console.error('Файл не найден:', imagePath);
        process.exit(1);
    }

    const ext = path.extname(imagePath).toLowerCase() || '.jpg';
    const mime =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const key = `diagnostics/sample-image-${Date.now()}${ext}`;
    const body = fs.readFileSync(imagePath);

    console.log('Upload', key, `(${body.length} bytes)`, mime);
    const up = await uploadPublicFile({ key, body, contentType: mime });

    if (!up.ok) {
        console.error(up);
        process.exit(2);
    }

    console.log('OK:', up.url);

    const keep = process.env.R2_SMOKE_KEEP === '1' || process.env.R2_SMOKE_KEEP === 'true';
    if (!keep) {
        await deleteObjectByKey(key);
        console.log('DeleteObject OK');
    } else {
        console.log('R2_SMOKE_KEEP=1 — файл оставлен в бакете');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(3);
});
