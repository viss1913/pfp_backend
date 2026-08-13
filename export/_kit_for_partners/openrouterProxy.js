const { SocksProxyAgent } = require('socks-proxy-agent');

let loggedOnce = false;

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
        const agent = new SocksProxyAgent(socksUrl, { timeout });
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

module.exports = {
    pickOpenRouterProxyUrl,
    openrouterAxiosExtras,
};
