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

/** @type {Promise<import('puppeteer').Browser>|null} */
let sharedBrowserPromise = null;

function buildLaunchOptions() {
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
    return launchOptions;
}

/**
 * Один браузер на процесс: повторные PDF (отчёт, NDA) не платят за launch каждый раз.
 * При обрыве соединения следующий вызов поднимет новый экземпляр.
 */
async function getSharedBrowser() {
    if (!sharedBrowserPromise) {
        const launchOptions = buildLaunchOptions();
        sharedBrowserPromise = puppeteer
            .launch(launchOptions)
            .then((browser) => {
                browser.once('disconnected', () => {
                    sharedBrowserPromise = null;
                });
                return browser;
            })
            .catch((err) => {
                sharedBrowserPromise = null;
                throw err;
            });
    }
    const browser = await sharedBrowserPromise;
    if (!browser.isConnected()) {
        sharedBrowserPromise = null;
        return getSharedBrowser();
    }
    return browser;
}

let shutdownHooksRegistered = false;

function registerShutdownHooksOnce() {
    if (shutdownHooksRegistered) return;
    shutdownHooksRegistered = true;
    const onShutdown = () => {
        closeSharedPuppeteerBrowser().catch(() => {});
    };
    process.once('SIGTERM', onShutdown);
    process.once('SIGINT', onShutdown);
}

/**
 * Закрыть общий браузер (тесты, graceful shutdown).
 * @returns {Promise<void>}
 */
async function closeSharedPuppeteerBrowser() {
    if (!sharedBrowserPromise) return;
    const p = sharedBrowserPromise;
    sharedBrowserPromise = null;
    try {
        const browser = await p;
        await browser.close();
    } catch {
        // уже закрыт или launch упал
    }
}

/**
 * Обложка и внутренние листы Finam: 210×297 mm ≈ 794×1123 px при 96dpi.
 * Viewport 595×842 давал узкий холст → контент «мелкий», поля по бокам в PDF.
 */
function resolvePdfViewportWidthHeight(html) {
    const h = String(html || '');
    if (h.includes('data-report-page="cover"')) {
        return { width: 794, height: 1123 };
    }
    const vw = Math.min(Math.max(Number(process.env.REPORT_PDF_VIEWPORT_WIDTH) || 794, 320), 1600);
    const vh = Math.min(Math.max(Number(process.env.REPORT_PDF_VIEWPORT_HEIGHT) || 1123, 400), 2400);
    return { width: vw, height: vh };
}

/**
 * Рендер одного HTML-документа в PDF (A4), тот же стек, что и отчёт PFP.
 * @param {string} html
 * @param {{ pdfScale?: number, preferCssPageSize?: boolean }} [options]
 * @returns {Promise<Buffer>}
 */
async function renderHtmlToPdfBuffer(html, options = {}) {
    registerShutdownHooksOnce();

    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    const pdfNavTimeoutMs = Math.min(
        Math.max(Number(process.env.REPORT_PDF_NAV_TIMEOUT_MS) || 120000, 15000),
        300000
    );
    const htmlStr = String(html || '');
    const isFinamV2Page =
        htmlStr.includes('data-finam-v2') || htmlStr.includes('finam-v2-report');
    const defaultPostLoadDelayMs = isFinamV2Page ? 80 : 300;
    const postLoadDelayMs = Math.min(
        Math.max(
            process.env.REPORT_PDF_POST_LOAD_DELAY_MS != null
                ? Number(process.env.REPORT_PDF_POST_LOAD_DELAY_MS)
                : defaultPostLoadDelayMs,
            0
        ),
        5000
    );
    const waitUntilEnv = String(process.env.REPORT_PDF_WAIT_UNTIL || '').trim().toLowerCase();
    const waitUntil =
        waitUntilEnv === 'domcontentloaded' || waitUntilEnv === 'load' || waitUntilEnv === 'networkidle0'
            ? waitUntilEnv
            : isFinamV2Page
              ? 'domcontentloaded'
              : 'load';
    const pdfScale = Math.min(Math.max(Number(options?.pdfScale) || 1, 0.1), 2);
    const preferCssPageSize = options?.preferCssPageSize !== false;

    try {
        page.setDefaultNavigationTimeout(pdfNavTimeoutMs);
        page.setDefaultTimeout(pdfNavTimeoutMs);
        const { width: vw, height: vh } = resolvePdfViewportWidthHeight(html);
        await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
        await page.setContent(html, {
            waitUntil,
            timeout: pdfNavTimeoutMs,
        });
        if (postLoadDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, postLoadDelayMs));
        }
        return await page.pdf({
            printBackground: true,
            format: 'A4',
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: preferCssPageSize,
            scale: pdfScale,
        });
    } finally {
        await page.close().catch(() => {});
    }
}

module.exports = {
    renderHtmlToPdfBuffer,
    getDefaultExecutablePath,
    closeSharedPuppeteerBrowser,
};
