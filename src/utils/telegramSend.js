const TELEGRAM_API_TIMEOUT_MS = Number(process.env.TELEGRAM_API_TIMEOUT_MS || 45000);
const TELEGRAM_API_RETRIES = Math.max(1, Number(process.env.TELEGRAM_API_RETRIES || 3));
const TELEGRAM_CHAT_TASK_TIMEOUT_MS = Number(process.env.TELEGRAM_CHAT_TASK_TIMEOUT_MS || 120000);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Обёртка для sendMessage/sendDocument/… — таймаут + несколько попыток при сбое прокси.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {string} label
 * @returns {Promise<T>}
 */
async function callTelegramApi(operation, label) {
    const retryDelaysMs = [0, 800, 2000];
    let lastErr;

    for (let attempt = 0; attempt < TELEGRAM_API_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay = retryDelaysMs[attempt] ?? 2000;
            console.warn(
                `[Telegram] Retry ${attempt}/${TELEGRAM_API_RETRIES - 1} for ${label}: ${lastErr?.message || lastErr}`
            );
            await sleep(delay);
        }
        try {
            return await withTimeout(operation(), TELEGRAM_API_TIMEOUT_MS, `Telegram API timeout: ${label}`);
        } catch (err) {
            lastErr = err;
        }
    }

    throw lastErr;
}

function withChatHandlerTimeout(promise, queueKey) {
    return withTimeout(promise, TELEGRAM_CHAT_TASK_TIMEOUT_MS, `Telegram chat handler timeout: ${queueKey}`);
}

module.exports = {
    TELEGRAM_API_TIMEOUT_MS,
    TELEGRAM_API_RETRIES,
    TELEGRAM_CHAT_TASK_TIMEOUT_MS,
    callTelegramApi,
    withChatHandlerTimeout,
};
