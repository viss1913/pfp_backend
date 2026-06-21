/**
 * Проверка доступа к api.telegram.org через TELEGRAM_PROXY_URL.
 *
 * Локально (SSH SOCKS-туннель в отдельном терминале):
 *   ssh -D 127.0.0.1:10809 -N root@YOUR_VPS
 *   TELEGRAM_PROXY_URL=socks5://127.0.0.1:10809 node scripts/smoke_telegram_proxy.mjs
 *
 * Прод (HTTP-прокси на VPS):
 *   TELEGRAM_PROXY_URL=http://user:pass@45.77.80.63:3128 node scripts/smoke_telegram_proxy.mjs
 */
import 'dotenv/config';
import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';

const TARGET = 'https://api.telegram.org';
const TIMEOUT_MS = 15000;

function parseProxyUrl() {
    const raw = process.env.TELEGRAM_PROXY_URL;
    if (!raw || !String(raw).trim()) {
        console.log('[smoke_telegram_proxy] TELEGRAM_PROXY_URL не задан — прямой запрос (без прокси)');
        return null;
    }
    return String(raw).trim();
}

function requestDirect() {
    return new Promise((resolve, reject) => {
        const req = https.get(TARGET, { timeout: TIMEOUT_MS }, (res) => {
            res.resume();
            resolve({ status: res.statusCode, via: 'direct' });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout (direct)'));
        });
        req.on('error', reject);
    });
}

function requestViaHttpProxy(proxyUrl) {
    return new Promise((resolve, reject) => {
        const target = new URL(TARGET);
        const proxy = new URL(proxyUrl);
        const auth = proxy.username
            ? Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`).toString('base64')
            : null;

        const req = https.request(
            {
                host: proxy.hostname,
                port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
                method: 'CONNECT',
                path: `${target.hostname}:443`,
                headers: auth ? { 'Proxy-Authorization': `Basic ${auth}` } : {},
                timeout: TIMEOUT_MS,
            },
            (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`CONNECT failed: HTTP ${res.statusCode}`));
                    return;
                }
                const socket = res.socket;
                const tlsReq = https.request(
                    {
                        host: target.hostname,
                        path: '/',
                        method: 'GET',
                        socket,
                        agent: false,
                        timeout: TIMEOUT_MS,
                    },
                    (tlsRes) => {
                        tlsRes.resume();
                        resolve({ status: tlsRes.statusCode, via: `http-proxy ${proxy.hostname}:${proxy.port || 80}` });
                    }
                );
                tlsReq.on('error', reject);
                tlsReq.on('timeout', () => {
                    tlsReq.destroy();
                    reject(new Error('timeout (http proxy tls)'));
                });
                tlsReq.end();
            }
        );
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout (http proxy connect)'));
        });
        req.end();
    });
}

function requestViaSocks(proxyUrl) {
    const agent = new SocksProxyAgent(proxyUrl);
    return new Promise((resolve, reject) => {
        const req = https.get(TARGET, { agent, timeout: TIMEOUT_MS }, (res) => {
            res.resume();
            resolve({ status: res.statusCode, via: `socks ${proxyUrl.replace(/:[^:@/]+@/, ':***@')}` });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout (socks)'));
        });
        req.on('error', reject);
    });
}

async function main() {
    const proxyUrl = parseProxyUrl();

    try {
        let result;
        if (!proxyUrl) {
            result = await requestDirect();
        } else {
            const protocol = new URL(proxyUrl).protocol.replace(':', '');
            if (protocol === 'http' || protocol === 'https') {
                result = await requestViaHttpProxy(proxyUrl);
            } else if (protocol === 'socks5' || protocol === 'socks4') {
                result = await requestViaSocks(proxyUrl);
            } else {
                console.error('[smoke_telegram_proxy] unsupported protocol in TELEGRAM_PROXY_URL');
                process.exit(1);
            }
        }

        console.log(`[smoke_telegram_proxy] OK ${TARGET} → HTTP ${result.status} via ${result.via}`);
        if (result.status >= 200 && result.status < 500) {
            process.exit(0);
        }
        console.error('[smoke_telegram_proxy] unexpected status');
        process.exit(1);
    } catch (err) {
        console.error('[smoke_telegram_proxy] FAIL:', err.message || err);
        if (!proxyUrl) {
            console.error('  Подсказка: если Immers блокирует Telegram — задай TELEGRAM_PROXY_URL');
        } else if (proxyUrl.includes('127.0.0.1:10809')) {
            console.error('  Подсказка: подними туннель: ssh -D 127.0.0.1:10809 -N root@YOUR_VPS');
        }
        process.exit(1);
    }
}

main();
