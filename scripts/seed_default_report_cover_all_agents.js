/**
 * Один раз: заливает дефолтный фон обложки (как в макете) в R2 и записывает URL
 * всем агентам в agent_report_pdf_settings.
 *
 * Требует .env: R2_* как у бэка + доступ к БД (knex).
 *
 * Переменные:
 *   SEED_COVER_ONLY_EMPTY=1  — не трогать тех, у кого cover_background_url уже задан
 *   IMAGE_PATH=...           — другой файл вместо assets/reports/rostech/cover-background.jpg
 *
 * Запуск: node scripts/seed_default_report_cover_all_agents.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const knex = require('../src/config/database');
const { uploadPublicFile, isR2ClientReady, isR2PublicUrlReady } = require('../src/utils/r2Client');
const { GLOBAL_DEFAULTS } = require('../src/reports/cover/buildCoverHtml');

const TABLE = 'agent_report_pdf_settings';

async function main() {
    const root = path.join(__dirname, '..');
    const imagePath = process.env.IMAGE_PATH
        ? path.resolve(process.env.IMAGE_PATH)
        : path.join(root, GLOBAL_DEFAULTS.coverBackgroundPath);

    if (!fs.existsSync(imagePath)) {
        console.error('Нет файла:', imagePath);
        process.exit(1);
    }

    if (!isR2ClientReady() || !isR2PublicUrlReady()) {
        console.error('R2 не сконфигурирован (см. docs/env-cloudflare-r2.md)');
        process.exit(1);
    }

    const ext = path.extname(imagePath).toLowerCase() || '.jpg';
    const mime =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const buf = fs.readFileSync(imagePath);
    const keyExt = ext === '.jpeg' ? '.jpg' : ext;
    const key = `pdf-report-covers/_shared/default-cover${keyExt}`;

    console.log('PutObject', key, `(${buf.length} bytes)`);
    const up = await uploadPublicFile({
        key,
        body: buf,
        contentType: mime,
    });

    if (!up.ok) {
        console.error('Загрузка в R2 не удалась:', up);
        process.exit(1);
    }

    const publicUrl = up.url;
    console.log('Публичный URL:', publicUrl);

    const onlyEmpty =
        process.env.SEED_COVER_ONLY_EMPTY === '1' || process.env.SEED_COVER_ONLY_EMPTY === 'true';

    const agents = await knex('agents').select('id').orderBy('id');
    if (!agents.length) {
        console.log('В таблице agents никого нет — только файл в R2.');
        await knex.destroy();
        process.exit(0);
    }

    let updated = 0;
    let skipped = 0;
    let inserted = 0;

    for (const { id: agentId } of agents) {
        const row = await knex(TABLE).where({ agent_id: agentId }).first();
        if (onlyEmpty && row?.cover_background_url) {
            skipped++;
            continue;
        }
        if (row) {
            await knex(TABLE).where({ agent_id: agentId }).update({
                cover_background_url: publicUrl,
                updated_at: knex.fn.now(),
            });
            updated++;
        } else {
            await knex(TABLE).insert({
                agent_id: agentId,
                cover_background_url: publicUrl,
            });
            inserted++;
        }
    }

    console.log(
        `Готово: агентов всего ${agents.length}, обновлено ${updated}, вставлено ${inserted}, пропущено (уже был фон) ${skipped}`
    );
    await knex.destroy();
}

main().catch(async (e) => {
    console.error(e);
    try {
        await knex.destroy();
    } catch (_) {}
    process.exit(1);
});
