/**
 * Скриншоты превью Finam v2 (нужен локальный сервер: python -m http.server 8766 в src/reports/finam_v2).
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { buildFinamReportV2Html } = require('../src/reports/finam_v2/buildFinamReportV2Html');

function getDefaultExecutablePath() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean);
    return candidates.find((p) => fs.existsSync(p)) || null;
}

const BASE = process.env.FINAM_V2_PREVIEW_URL || 'http://127.0.0.1:8766';
const OUT_DIR = path.join(__dirname, '..', 'tmp');
const EXPECTED_MERGED_IFRAMES = 21;

async function assertNoA4Overflow(page, label) {
    const pageHeights = await page.$$eval('article.finam-v2-page', (pages) =>
        pages.map((article, index) => ({
            page: index + 1,
            clientHeight: article.clientHeight,
            scrollHeight: article.scrollHeight,
            overflow: article.scrollHeight - article.clientHeight,
        }))
    );
    if (pageHeights.length === 0) {
        throw new Error(`${label} does not contain article.finam-v2-page`);
    }
    for (const metrics of pageHeights) {
        if (metrics.overflow > 0) {
            throw new Error(
                `${label} page ${metrics.page} overflows A4 by ${metrics.overflow}px ` +
                    `(scrollHeight=${metrics.scrollHeight}, clientHeight=${metrics.clientHeight})`
            );
        }
    }
    return pageHeights;
}

async function main() {
    const executablePath = getDefaultExecutablePath();
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = await browser.newPage();

        if (!fs.existsSync(OUT_DIR)) {
            fs.mkdirSync(OUT_DIR, { recursive: true });
        }

        for (const { name, path: p, fullPage, skipA4Check } of [
        { name: 'finam-v2-cover.png', path: '/page-cover-v2.html', fullPage: false },
        { name: 'finam-v2-intro.png', path: '/page-intro-v2.html', fullPage: false },
        { name: 'finam-v2-current-state.png', path: '/page-current-state-v2.html', fullPage: false },
        { name: 'finam-v2-goals.png', path: '/page-goals-v2.html', fullPage: false },
        { name: 'finam-v2-executive-summary.png', path: '/page-executive-summary-v2.html', fullPage: false },
        { name: 'finam-v2-goal-fin-reserve.png', path: '/page-goal-fin-reserve-v2.html', fullPage: false },
        { name: 'finam-v2-goal-life.png', path: '/page-goal-life-v2.html', fullPage: false },
        { name: 'finam-v2-goal-pension.png', path: '/page-goal-pension-v2.html', fullPage: true },
        { name: 'finam-v2-goal-passive-income.png', path: '/page-goal-passive-income-v2.html', fullPage: true },
        { name: 'finam-v2-goal-save-grow.png', path: '/page-goal-save-grow-v2.html', fullPage: true },
        { name: 'finam-v2-goal-other.png', path: '/page-goal-other-v2.html', fullPage: true },
        { name: 'finam-v2-portfolio-summary.png', path: '/page-portfolio-summary-v2.html', fullPage: true },
        { name: 'finam-v2-tax-planning.png', path: '/page-tax-planning-v2.html', fullPage: false },
        { name: 'finam-v2-comon-autofollow.png', path: '/page-comon-autofollow-v2.html', fullPage: true },
        { name: 'finam-v2-idu-strategies.png', path: '/page-idu-strategies-v2.html', fullPage: true },
        { name: 'finam-v2-finam-offers.png', path: '/page-finam-offers-v2.html', fullPage: false },
        { name: 'finam-v2-inflation.png', path: '/page-inflation-v2.html', fullPage: false },
        { name: 'finam-v2-roadmap.png', path: '/page-roadmap-v2.html', fullPage: false },
        { name: 'finam-v2-detailed-plan.png', path: '/page-detailed-plan-v2.html', fullPage: true },
        { name: 'finam-v2-risk-declaration.png', path: '/page-risk-declaration-v2.html', fullPage: true },
        { name: 'finam-v2-partner-value.png', path: '/page-partner-value-v2.html', fullPage: false },
        { name: 'finam-v2-merged.png', path: '/preview-merged.html', fullPage: true, skipA4Check: true },
        ]) {
            const url = `${BASE}${p}`;
            await page.setViewport({ width: 640, height: 900, deviceScaleFactor: 2 });
            const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
            if (!response || !response.ok()) {
                throw new Error(`${p} returned HTTP ${response ? response.status() : 'no response'}`);
            }
            const pageHeights = skipA4Check
                ? await page.$$eval('iframe', (frames) => frames.map((frame) => ({ title: frame.title || frame.id, src: frame.getAttribute('src') || '' })))
                : await assertNoA4Overflow(page, p);
            if (skipA4Check && pageHeights.length !== EXPECTED_MERGED_IFRAMES) {
                throw new Error(`${p} iframe count must be ${EXPECTED_MERGED_IFRAMES}, got ${pageHeights.length}`);
            }
            if (skipA4Check && pageHeights.some((frame) => !frame.src.includes('.html'))) {
                throw new Error(`${p} contains preview iframe without html src`);
            }
            const out = path.join(OUT_DIR, name);
            await page.screenshot({
                path: out,
                fullPage: fullPage || false,
            });
            console.log('Wrote', out, skipA4Check ? `preview iframes checked: ${pageHeights.length}` : `A4 pages checked: ${pageHeights.length}`);
        }

        await page.setViewport({ width: 640, height: 900, deviceScaleFactor: 2 });
        await page.setContent(buildFinamReportV2Html(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        const generatedHeights = await assertNoA4Overflow(page, 'generated buildFinamReportV2Html');
        const generatedOut = path.join(OUT_DIR, 'finam-v2-generated-wow.png');
        await page.screenshot({
            path: generatedOut,
            fullPage: true,
        });
        console.log('Wrote', generatedOut, `A4 pages checked: ${generatedHeights.length}`);
    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
