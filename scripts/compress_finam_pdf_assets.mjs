/**
 * Пережимает тяжёлые WebP для PDF Финам (todo, hero и др.) через sharp.
 * Запуск: node scripts/compress_finam_pdf_assets.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const TARGETS = [
    path.join(REPO, 'src', 'reports', 'finam', 'assets', 'todo'),
    path.join(REPO, 'assets', 'reports', 'goal-cards', 'hero-image.webp'),
];

const WEBP_OPTIONS = { quality: 78, effort: 6, smartSubsample: true };

async function compressWebpFile(absPath) {
    const before = fs.statSync(absPath).size;
    const tmp = path.join(os.tmpdir(), `pfp-compress-${process.pid}-${path.basename(absPath)}`);
    await sharp(absPath).webp(WEBP_OPTIONS).toFile(tmp);
    const after = fs.statSync(tmp).size;
    // Windows/OneDrive: нельзя атомарно перезаписать «живой» файл — пишем во временный и подменяем имя.
    const staging = `${absPath}.pfp-recompress.webp`;
    fs.copyFileSync(tmp, staging);
    fs.unlinkSync(tmp);
    fs.unlinkSync(absPath);
    fs.renameSync(staging, absPath);
    console.log(`${path.relative(REPO, absPath)}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB`);
}

async function main() {
    for (const t of TARGETS) {
        if (!fs.existsSync(t)) {
            console.warn('skip missing:', t);
            continue;
        }
        const st = fs.statSync(t);
        if (st.isFile() && t.toLowerCase().endsWith('.webp')) {
            await compressWebpFile(t);
            continue;
        }
        if (st.isDirectory()) {
            const files = fs.readdirSync(t).filter((f) => f.toLowerCase().endsWith('.webp'));
            for (const f of files) {
                await compressWebpFile(path.join(t, f));
            }
        }
    }
    console.log('done');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
