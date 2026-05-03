const fs = require('fs');
const puppeteer = require('puppeteer');

function getDefaultExecutablePath() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN,
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean);

    return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * Рендер одного HTML-документа в PDF (A4), тот же стек, что и отчёт PFP.
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
async function renderHtmlToPdfBuffer(html) {
    const executablePath = getDefaultExecutablePath();
    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
        ],
    };

    if (executablePath) {
        launchOptions.executablePath = executablePath;
    }

    const browser = await puppeteer.launch(launchOptions);
    try {
        const page = await browser.newPage();
        const pdfNavTimeoutMs = Math.min(
            Math.max(Number(process.env.REPORT_PDF_NAV_TIMEOUT_MS) || 120000, 15000),
            300000
        );
        page.setDefaultNavigationTimeout(pdfNavTimeoutMs);
        page.setDefaultTimeout(pdfNavTimeoutMs);
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
        await page.setContent(html, {
            waitUntil: 'load',
            timeout: pdfNavTimeoutMs,
        });
        await new Promise((resolve) => setTimeout(resolve, 450));
        return await page.pdf({
            printBackground: true,
            format: 'A4',
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: true,
        });
    } finally {
        await browser.close();
    }
}

module.exports = {
    renderHtmlToPdfBuffer,
    getDefaultExecutablePath,
};
