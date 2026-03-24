/**
 * PNG → WebP (sharp). Файл или папка (рекурсивно только *.png).
 *
 *   node scripts/png_to_webp.js path/to/image.png
 *   node scripts/png_to_webp.js assets/reports/goal-cards
 *   node scripts/png_to_webp.js ./folder --force   перезаписать существующие .webp
 */
const fs = require('fs');
const path = require('path');
const { bufferToWebp } = require('../src/utils/imageToWebp');

async function convertFile(pngPath, force) {
    const dir = path.dirname(pngPath);
    const base = path.basename(pngPath, path.extname(pngPath));
    const outPath = path.join(dir, `${base}.webp`);
    if (fs.existsSync(outPath) && !force) {
        console.log('skip (есть .webp):', outPath);
        return;
    }
    const buf = fs.readFileSync(pngPath);
    const webp = await bufferToWebp(buf);
    fs.writeFileSync(outPath, webp);
    console.log('ok:', outPath, `(${(webp.length / 1024).toFixed(1)} KB)`);
}

function collectPngs(root, acc = []) {
    const st = fs.statSync(root);
    if (st.isFile()) {
        if (root.toLowerCase().endsWith('.png')) acc.push(root);
        return acc;
    }
    for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name);
        const s = fs.statSync(full);
        if (s.isDirectory()) collectPngs(full, acc);
        else if (name.toLowerCase().endsWith('.png')) acc.push(full);
    }
    return acc;
}

async function main() {
    const force = process.argv.includes('--force');
    const targets = process.argv.slice(2).filter((a) => a !== '--force');
    if (!targets.length) {
        console.error('Usage: node scripts/png_to_webp.js <file.png|directory> [--force]');
        process.exit(1);
    }
    for (const t of targets) {
        const abs = path.resolve(process.cwd(), t);
        if (!fs.existsSync(abs)) {
            console.error('нет такого пути:', abs);
            process.exit(1);
        }
        const pngs = collectPngs(abs);
        if (!pngs.length) {
            console.warn('PNG не найдены:', abs);
            continue;
        }
        for (const png of pngs) {
            await convertFile(png, force);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
