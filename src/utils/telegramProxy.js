const { SocksProxyAgent } = require('socks-proxy-agent');

let loggedOnce = false;

/**
 * Исходящий прокси только для node-telegram-bot-api (не глобальный HTTP_PROXY).
 * TELEGRAM_PROXY_URL: http(s)://[user:pass@]host:port или socks5://[user:pass@]host:port
 * @returns {import('request').CoreOptions}
 */
function telegramProxyRequestOptions() {
    const raw = process.env.TELEGRAM_PROXY_URL;
    if (raw == null || !String(raw).trim()) return {};

    const url = String(raw).trim();
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        console.warn('[telegramProxy] TELEGRAM_PROXY_URL is invalid, ignored');
        return {};
    }

    const protocol = parsed.protocol.replace(':', '');
    if (protocol === 'http' || protocol === 'https') {
        if (!loggedOnce) {
            loggedOnce = true;
            console.info(
                '[telegramProxy] Telegram Bot API uses TELEGRAM_PROXY_URL (http proxy host=%s port=%s)',
                parsed.hostname,
                parsed.port || (protocol === 'https' ? '443' : '80')
            );
        }
        return { proxy: url };
    }

    if (protocol === 'socks5' || protocol === 'socks4') {
        if (!loggedOnce) {
            loggedOnce = true;
            console.info(
                '[telegramProxy] Telegram Bot API uses TELEGRAM_PROXY_URL (%s proxy host=%s port=%s)',
                protocol,
                parsed.hostname,
                parsed.port || '1080'
            );
        }
        return { agent: new SocksProxyAgent(url) };
    }

    console.warn('[telegramProxy] TELEGRAM_PROXY_URL must be http(s):// or socks5://, ignored');
    return {};
}

/**
 * Опции конструктора TelegramBot (polling + request proxy).
 * @returns {{ polling: true, request: import('request').CoreOptions }}
 */
function telegramBotOptions() {
    return {
        polling: true,
        request: telegramProxyRequestOptions(),
    };
}

module.exports = {
    telegramProxyRequestOptions,
    telegramBotOptions,
};
