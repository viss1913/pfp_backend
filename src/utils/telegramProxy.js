const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');

let loggedOnce = false;

const PROBE_TIMEOUT_MS = Number(process.env.TELEGRAM_PROXY_PROBE_TIMEOUT_MS || 15000);
const TELEGRAM_API_HOST = 'https://api.telegram.org';

/**
 * socks5:// резолвит хост локально (на Immers api.telegram.org → заблокированный IP).
 * socks5h:// — DNS на стороне прокси (аналог curl --socks5-hostname).
 * @param {string} url
 * @returns {string}
 */
function socksProxyUrlWithRemoteDns(url) {
    return String(url)
        .replace(/^socks5:\/\//i, 'socks5h://')
        .replace(/^socks4:\/\//i, 'socks4a://');
}

function parseTelegramProxyUrl() {
    const raw = process.env.TELEGRAM_PROXY_URL;
    if (raw == null || !String(raw).trim()) return null;
    try {
        return new URL(String(raw).trim());
    } catch {
        return null;
    }
}

function buildRequestOptionsFromProxyUrl(parsed) {
    if (!parsed) return {};

    const protocol = parsed.protocol.replace(':', '');
    const timeout = Number(process.env.TELEGRAM_API_TIMEOUT_MS || 45000);
    const base = {
        timeout,
        forever: false,
        pool: { maxSockets: 4 },
    };

    if (protocol === 'http' || protocol === 'https') {
        return { ...base, proxy: parsed.toString() };
    }

    if (protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks4' || protocol === 'socks4a') {
        const socksUrl = socksProxyUrlWithRemoteDns(parsed.toString());
        const agent = new SocksProxyAgent(socksUrl, { timeout });
        return {
            ...base,
            agent,
            httpsAgent: agent,
            httpAgent: agent,
        };
    }

    return {};
}

/**
 * Исходящий прокси только для node-telegram-bot-api (не глобальный HTTP_PROXY).
 * TELEGRAM_PROXY_URL: http(s)://[user:pass@]host:port или socks5(h)://[user:pass@]host:port
 * @returns {import('request').CoreOptions}
 */
function telegramProxyRequestOptions() {
    const parsed = parseTelegramProxyUrl();
    if (!parsed) return {};

    const protocol = parsed.protocol.replace(':', '');
    const opts = buildRequestOptionsFromProxyUrl(parsed);
    if (!opts.agent && !opts.proxy) {
        console.warn('[telegramProxy] TELEGRAM_PROXY_URL must be http(s):// or socks5://, ignored');
        return {};
    }

    if (!loggedOnce) {
        loggedOnce = true;
        if (protocol === 'http' || protocol === 'https') {
            console.info(
                '[telegramProxy] Telegram Bot API uses TELEGRAM_PROXY_URL (http proxy host=%s port=%s timeout=%sms)',
                parsed.hostname,
                parsed.port || (protocol === 'https' ? '443' : '80'),
                opts.timeout
            );
        } else {
            console.info(
                '[telegramProxy] Telegram Bot API uses TELEGRAM_PROXY_URL (%s → remote DNS, host=%s port=%s timeout=%sms)',
                protocol,
                parsed.hostname,
                parsed.port || '1080',
                opts.timeout
            );
        }
    }

    return opts;
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

function probeHttps(targetUrl, requestOptions = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            targetUrl,
            {
                timeout: PROBE_TIMEOUT_MS,
                agent: requestOptions.agent,
                ...requestOptions,
            },
            (res) => {
                res.resume();
                resolve({ status: res.statusCode, via: requestOptions.viaLabel || 'direct' });
            }
        );
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`probe timeout (${PROBE_TIMEOUT_MS}ms)`));
        });
        req.on('error', reject);
    });
}

/**
 * Смоук egress к api.telegram.org: direct и через TELEGRAM_PROXY_URL.
 * @returns {Promise<{ direct: object|null, proxy: object|null }>}
 */
async function probeTelegramEgress() {
    const result = { direct: null, proxy: null };

    try {
        const started = Date.now();
        const direct = await probeHttps(TELEGRAM_API_HOST, { viaLabel: 'direct' });
        result.direct = { ...direct, latencyMs: Date.now() - started };
    } catch (err) {
        result.direct = { ok: false, error: err.message || String(err) };
    }

    const parsed = parseTelegramProxyUrl();
    if (parsed) {
        try {
            const started = Date.now();
            const opts = buildRequestOptionsFromProxyUrl(parsed);
            const proxy = await probeHttps(TELEGRAM_API_HOST, {
                ...opts,
                viaLabel: `proxy ${parsed.hostname}:${parsed.port || ''}`,
            });
            result.proxy = { ...proxy, latencyMs: Date.now() - started };
        } catch (err) {
            result.proxy = { ok: false, error: err.message || String(err) };
        }
    }

    return result;
}

function logTelegramEgressProbe(probe) {
    if (probe.direct?.status) {
        console.info(
            '[telegramProxy] Probe direct api.telegram.org → HTTP %s (%sms)',
            probe.direct.status,
            probe.direct.latencyMs
        );
    } else {
        console.warn('[telegramProxy] Probe direct api.telegram.org FAILED: %s', probe.direct?.error || 'unknown');
    }

    if (!probe.proxy) return;

    if (probe.proxy?.status) {
        console.info(
            '[telegramProxy] Probe proxy api.telegram.org → HTTP %s (%sms)',
            probe.proxy.status,
            probe.proxy.latencyMs
        );
    } else {
        console.error('[telegramProxy] Probe proxy api.telegram.org FAILED: %s', probe.proxy?.error || 'unknown');
    }
}

module.exports = {
    telegramProxyRequestOptions,
    telegramBotOptions,
    probeTelegramEgress,
    logTelegramEgressProbe,
};
