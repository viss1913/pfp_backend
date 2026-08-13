/**
 * Smoke: direct vs HTTP proxy vs SOCKS для OpenRouter.
 *
 * Usage (из корня проекта, после копирования openrouterProxy.js в src/utils/):
 *   node export/openrouter-immers-proxy-kit/scripts/test_openrouter_proxy.js
 * или положить в scripts/ и поправить require:
 *   node scripts/test_openrouter_proxy.js
 */
require('dotenv').config();
const axios = require('axios');
const path = require('path');
const { SocksProxyAgent } = require('socks-proxy-agent');

const utilPath = path.join(__dirname, '..', 'openrouterProxy.js');
const { openrouterAxiosExtras } = require(
    require('fs').existsSync(utilPath)
        ? utilPath
        : path.join(__dirname, '..', '..', 'src', 'utils', 'openrouterProxy.js')
);

const key = process.env.OPENROUTER_API_KEY;
const httpProxy = process.env.OPENROUTER_PROXY_URL;
const socksProxy = process.env.TELEGRAM_PROXY_URL;
const model = process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it';

function axiosHttpProxy(raw) {
    if (!raw || !String(raw).trim()) return null;
    try {
        const u = new URL(String(raw).trim());
        const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
        const cfg = { protocol: u.protocol.replace(':', ''), host: u.hostname, port };
        if (u.username) {
            cfg.auth = {
                username: decodeURIComponent(u.username),
                password: decodeURIComponent(u.password || ''),
            };
        }
        return cfg;
    } catch {
        return null;
    }
}

function socksAgent(raw) {
    if (!raw || !String(raw).trim()) return null;
    const url = String(raw).trim().replace(/^socks5:\/\//i, 'socks5h://');
    return new SocksProxyAgent(url, { timeout: 30000 });
}

async function test(label, extra = {}) {
    try {
        const r = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            { model, messages: [{ role: 'user', content: 'ping' }], stream: false },
            {
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://pfp.app',
                    'X-Title': 'OpenRouter Proxy Smoke',
                },
                timeout: 30000,
                proxy: false,
                ...extra,
            }
        );
        const text = r.data?.choices?.[0]?.message?.content || '';
        console.log(`${label} OK: ${text.slice(0, 80)}`);
        return true;
    } catch (e) {
        const status = e.response?.status;
        const data = typeof e.response?.data === 'string'
            ? e.response.data.slice(0, 120)
            : JSON.stringify(e.response?.data || e.message).slice(0, 200);
        console.log(`${label} FAIL ${status}: ${data}`);
        return false;
    }
}

(async () => {
    if (!key) {
        console.error('Set OPENROUTER_API_KEY in .env');
        process.exit(1);
    }
    console.log('OPENROUTER_PROXY_URL:', httpProxy || '(not set)');
    console.log('TELEGRAM_PROXY_URL:', socksProxy || '(not set)');
    console.log('pickOpenRouterProxyUrl →', require(utilPath).pickOpenRouterProxyUrl?.() || '(n/a)');
    console.log('---');
    await test('1) direct (no proxy)');
    const hp = axiosHttpProxy(httpProxy);
    if (hp && /^http/.test(httpProxy)) await test(`2) http proxy ${hp.host}:${hp.port}`, { proxy: hp });
    const sa = socksAgent(socksProxy);
    if (sa) await test(`3) socks ${socksProxy}`, { httpsAgent: sa, httpAgent: sa });
    await test('4) openrouterAxiosExtras()', openrouterAxiosExtras());
})();
