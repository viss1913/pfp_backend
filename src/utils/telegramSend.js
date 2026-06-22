const TELEGRAM_API_TIMEOUT_MS = Number(process.env.TELEGRAM_API_TIMEOUT_MS || 60000);
const TELEGRAM_API_RETRIES = Math.max(1, Number(process.env.TELEGRAM_API_RETRIES || 3));
const TELEGRAM_CHAT_TASK_TIMEOUT_MS = Number(process.env.TELEGRAM_CHAT_TASK_TIMEOUT_MS || 180000);

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

function collectTelegramErrorText(err) {
    const parts = [];
    let current = err;
    while (current) {
        if (current.message) parts.push(String(current.message));
        if (current.code) parts.push(String(current.code));
        current = current.cause;
    }
    return parts.join(' ');
}

function isTelegramApiTimeoutError(err) {
    return collectTelegramErrorText(err).includes('Telegram API timeout:');
}

function isTelegramChatHandlerTimeoutError(err) {
    return collectTelegramErrorText(err).includes('Telegram chat handler timeout:');
}

/** Таймаут сокета/ответа через прокси — sendMessage мог уже уйти в Telegram, повтор и «ошибка» опасны. */
function isTelegramSocketTimeoutError(err) {
    return /ESOCKETTIMEDOUT|ETIMEDOUT|ECONNABORTED/i.test(collectTelegramErrorText(err));
}

function isUncertainTelegramDeliveryError(err) {
    return (
        isTelegramApiTimeoutError(err) ||
        isTelegramChatHandlerTimeoutError(err) ||
        isTelegramSocketTimeoutError(err)
    );
}

/**
 * Повторяем только когда запрос с высокой вероятностью не дошёл до Telegram.
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryableTelegramError(err) {
    if (isUncertainTelegramDeliveryError(err)) return false;

    const msg = collectTelegramErrorText(err);
    const status = err?.response?.statusCode ?? err?.response?.status;

    if (status === 429) return true;
    if (status >= 502 && status <= 504) return true;
    if (/ECONNRESET|ECONNREFUSED|ENETUNREACH|EAI_AGAIN|socket hang up|network/i.test(msg)) return true;

    return false;
}

/**
 * Обёртка для sendMessage/sendDocument/… — таймаут + retry только на сетевых сбоях.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {string} label
 * @param {{ retryOnTimeout?: boolean, maxRetries?: number }} [options]
 * @returns {Promise<T>}
 */
async function callTelegramApi(operation, label, options = {}) {
    const maxRetries = Math.max(1, options.maxRetries ?? TELEGRAM_API_RETRIES);
    const retryOnTimeout = options.retryOnTimeout === true;
    const retryDelaysMs = [0, 800, 2000];
    let lastErr;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
            const delay = retryDelaysMs[attempt] ?? 2000;
            console.warn(
                `[Telegram] Retry ${attempt}/${maxRetries - 1} for ${label}: ${lastErr?.message || lastErr}`
            );
            await sleep(delay);
        }
        try {
            return await withTimeout(operation(), TELEGRAM_API_TIMEOUT_MS, `Telegram API timeout: ${label}`);
        } catch (err) {
            lastErr = err;
            if (isTelegramApiTimeoutError(err)) {
                if (!retryOnTimeout) {
                    console.warn(
                        `[Telegram] ${label}: response timeout — not retrying (message may already be delivered via proxy)`
                    );
                    throw err;
                }
            } else if (isTelegramSocketTimeoutError(err)) {
                console.warn(
                    `[Telegram] ${label}: socket timeout — not retrying (message may already be delivered via proxy)`
                );
                throw err;
            } else if (!isRetryableTelegramError(err)) {
                throw err;
            }
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
    isTelegramApiTimeoutError,
    isTelegramChatHandlerTimeoutError,
    isTelegramSocketTimeoutError,
    isUncertainTelegramDeliveryError,
    isRetryableTelegramError,
    callTelegramApi,
    withChatHandlerTimeout,
};
