const { SocksProxyAgent } = require('socks-proxy-agent');

let loggedOnce = false;
let relayLoggedOnce = false;

/** Railway / other HTTP relay for OpenRouter (Immers → relay → openrouter.ai). */
function resolveOpenRouterRelayBaseUrl() {
    const raw = String(process.env.OPENROUTER_RELAY_URL || '').trim();
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
}

function isOpenRouterRelayEnabled() {
    return Boolean(resolveOpenRouterRelayBaseUrl());
}

/** SOCKS/HTTP egress only for openrouter.ai; KIE and other OpenAI-compatible hosts go direct. */
function shouldUseOpenRouterEgressProxy() {
    if (isOpenRouterRelayEnabled()) return false;
    if (String(process.env.KIE_API_KEY || '').trim()) return false;
    const base = String(process.env.OPENROUTER_BASE_URL || process.env.KIE_BASE_URL || '')
        .trim()
        .toLowerCase();
    if (base && !base.includes('openrouter.ai')) return false;
    return true;
}

function socksProxyUrlWithRemoteDns(url) {
    return String(url)
        .replace(/^socks5:\/\//i, 'socks5h://')
        .replace(/^socks4:\/\//i, 'socks4a://');
}

/**
 * SOCKS предпочтительнее HTTP: на Immers OPENROUTER_PROXY_URL часто http://…:3128 (Squid),
 * а рабочий egress — socks5://…:10809 (как TELEGRAM_PROXY_URL).
 */
function pickOpenRouterProxyUrl() {
    const candidates = [process.env.OPENROUTER_PROXY_URL, process.env.TELEGRAM_PROXY_URL]
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean);

    const socks = candidates.find((u) => /^socks/i.test(u));
    if (socks) return socks;

    return candidates[0] || null;
}

function parseProxyUrl(raw) {
    if (!raw) return null;
    try {
        return new URL(raw);
    } catch {
        return null;
    }
}

function axiosHttpProxyConfig(parsed) {
    const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    const cfg = {
        protocol: parsed.protocol.replace(':', ''),
        host: parsed.hostname,
        port,
    };
    if (parsed.username) {
        cfg.auth = {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password || ''),
        };
    }
    return cfg;
}

/**
 * Доп. опции axios для OpenRouter (socks/http). Для socks обязательно proxy: false.
 * @returns {import('axios').AxiosRequestConfig}
 */
function openrouterAxiosExtras() {
    if (isOpenRouterRelayEnabled()) {
        const timeout = Number(process.env.OPENROUTER_HTTP_TIMEOUT_MS || 60000);
        if (!relayLoggedOnce) {
            relayLoggedOnce = true;
            console.info('[openrouterProxy] OpenRouter via HTTP relay %s (no SOCKS)', resolveOpenRouterRelayBaseUrl());
        }
        return { timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 60000 };
    }

    if (!shouldUseOpenRouterEgressProxy()) {
        const timeout = Number(process.env.OPENROUTER_HTTP_TIMEOUT_MS || 60000);
        if (!relayLoggedOnce) {
            relayLoggedOnce = true;
            const base = process.env.OPENROUTER_BASE_URL || process.env.KIE_BASE_URL || 'direct';
            console.info('[openrouterProxy] LLM direct (no SOCKS) base=%s', base);
        }
        return { timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 60000 };
    }

    const raw = pickOpenRouterProxyUrl();
    const parsed = parseProxyUrl(raw);
    if (!parsed) return {};

    const protocol = parsed.protocol.replace(':', '');
    const timeout = Number(process.env.OPENROUTER_HTTP_TIMEOUT_MS || 30000);

    if (protocol === 'http' || protocol === 'https') {
        if (!loggedOnce) {
            loggedOnce = true;
            console.info(
                '[openrouterProxy] OpenRouter uses HTTP proxy host=%s port=%s',
                parsed.hostname,
                parsed.port || 80
            );
        }
        return {
            proxy: axiosHttpProxyConfig(parsed),
            timeout,
        };
    }

    if (protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks4' || protocol === 'socks4a') {
        const socksUrl = socksProxyUrlWithRemoteDns(parsed.toString());
        const agent = new SocksProxyAgent(socksUrl, {
            timeout,
            keepAlive: true,
        });
        if (!loggedOnce) {
            loggedOnce = true;
            console.info(
                '[openrouterProxy] OpenRouter uses %s → remote DNS, host=%s port=%s',
                protocol,
                parsed.hostname,
                parsed.port || '1080'
            );
        }
        return {
            proxy: false,
            httpAgent: agent,
            httpsAgent: agent,
            timeout,
        };
    }

    return {};
}

/** Stream: те же proxy/agent, увеличенный timeout (отдельный agent — иначе 60s лимит на больших промптах). */
function openrouterStreamAxiosExtras() {
    if (isOpenRouterRelayEnabled()) {
        const timeout = Number(
            process.env.OPENROUTER_STREAM_TIMEOUT_MS || process.env.OPENROUTER_HTTP_TIMEOUT_MS || 120000
        );
        const streamTimeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 120000;
        if (!relayLoggedOnce) {
            relayLoggedOnce = true;
            console.info('[openrouterProxy] OpenRouter stream via HTTP relay %s (no SOCKS)', resolveOpenRouterRelayBaseUrl());
        }
        return { timeout: streamTimeout };
    }

    if (!shouldUseOpenRouterEgressProxy()) {
        const timeout = Number(
            process.env.OPENROUTER_STREAM_TIMEOUT_MS || process.env.OPENROUTER_HTTP_TIMEOUT_MS || 120000
        );
        const streamTimeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 120000;
        if (!relayLoggedOnce) {
            relayLoggedOnce = true;
            const base = process.env.OPENROUTER_BASE_URL || process.env.KIE_BASE_URL || 'direct';
            console.info('[openrouterProxy] LLM stream direct (no SOCKS) base=%s', base);
        }
        return { timeout: streamTimeout };
    }

    const raw = pickOpenRouterProxyUrl();
    const parsed = parseProxyUrl(raw);
    const timeout = Number(
        process.env.OPENROUTER_STREAM_TIMEOUT_MS || process.env.OPENROUTER_HTTP_TIMEOUT_MS || 120000
    );
    const streamTimeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 120000;

    if (!parsed) return { timeout: streamTimeout };

    const protocol = parsed.protocol.replace(':', '');
    if (protocol === 'http' || protocol === 'https') {
        return {
            ...openrouterAxiosExtras(),
            timeout: streamTimeout,
        };
    }

    if (protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks4' || protocol === 'socks4a') {
        const socksUrl = socksProxyUrlWithRemoteDns(parsed.toString());
        const agent = new SocksProxyAgent(socksUrl, {
            timeout: streamTimeout,
            keepAlive: true,
        });
        return {
            proxy: false,
            httpAgent: agent,
            httpsAgent: agent,
            timeout: streamTimeout,
        };
    }

    return { ...openrouterAxiosExtras(), timeout: streamTimeout };
}

module.exports = {
    pickOpenRouterProxyUrl,
    resolveOpenRouterRelayBaseUrl,
    isOpenRouterRelayEnabled,
    openrouterAxiosExtras,
    openrouterStreamAxiosExtras,
};
