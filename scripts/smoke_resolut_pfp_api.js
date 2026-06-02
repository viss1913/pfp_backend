#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Смоук PFP API → Resolut (после деплоя): логин агента, products, link, опционально publish-preview / suggest-quote-line.
 *
 * Usage:
 *   node scripts/smoke_resolut_pfp_api.js --api-base=https://pfpbackend-production.up.railway.app --email=... --password=...
 *   # или переменные: PFP_SMOKE_API_BASE, PFP_SMOKE_EMAIL, PFP_SMOKE_PASSWORD
 *
 * Опционально:
 *   --client-id=123   → POST publish-preview с пустым quotes (проверка 400) или передай --skip-preview
 *   --product-id=1 --client-id=1 --amount=1000000 → suggest-quote-line
 */
const axios = require('axios');

function getArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    if (!hit) return fallback;
    return hit.slice(prefix.length);
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

async function main() {
    const apiBase = (
        getArg('api-base', process.env.PFP_SMOKE_API_BASE || 'https://pfpbackend-production.up.railway.app')
    ).replace(/\/$/, '');
    const email = getArg('email', process.env.PFP_SMOKE_EMAIL || '');
    const password = getArg('password', process.env.PFP_SMOKE_PASSWORD || '');
    const clientId = getArg('client-id', process.env.PFP_SMOKE_CLIENT_ID || '');
    const productId = getArg('product-id', process.env.PFP_SMOKE_PRODUCT_ID || '');
    const amount = getArg('amount', '1000000');
    const timeoutMs = Number(getArg('timeout-ms', '60000'));

    if (!email || !password) {
        console.error('Нужны учётные данные агента проекта Resolut (23):');
        console.error('  --email= --password=  или PFP_SMOKE_EMAIL / PFP_SMOKE_PASSWORD');
        console.error(`Пример: node scripts/smoke_resolut_pfp_api.js --api-base=${apiBase} --email=you@x.ru --password=***`);
        process.exitCode = 1;
        return;
    }

    const http = axios.create({
        baseURL: apiBase,
        timeout: timeoutMs,
        validateStatus: () => true
    });

    console.log('1) POST /api/auth/login');
    const loginRes = await http.post('/api/auth/login', { email, password });
    console.log('   status', loginRes.status);
    if (loginRes.status !== 200 || !loginRes.data?.token) {
        console.error('   body', JSON.stringify(loginRes.data, null, 2));
        process.exitCode = 1;
        return;
    }
    const token = loginRes.data.token;
    const auth = { Authorization: `Bearer ${token}` };

    console.log('2) POST /api/pfp/resolut/products');
    const productsRes = await http.post('/api/pfp/resolut/products', { data: {} }, { headers: auth });
    console.log('   status', productsRes.status);
    console.log('   body', JSON.stringify(productsRes.data, null, 2).slice(0, 2000));

    console.log('3) GET /api/pfp/resolut/link');
    const linkRes = await http.get('/api/pfp/resolut/link', { headers: auth });
    console.log('   status', linkRes.status);
    console.log('   body', JSON.stringify(linkRes.data, null, 2).slice(0, 500));

    if (productId && clientId) {
        console.log('4) POST /api/pfp/resolut/suggest-quote-line');
        const sug = await http.post(
            '/api/pfp/resolut/suggest-quote-line',
            {
                client_id: Number(clientId),
                product_id: Number(productId),
                amount: Number(amount),
                term_months: 60,
                valuation_type: 'byLimit'
            },
            { headers: auth }
        );
        console.log('   status', sug.status);
        console.log('   body', JSON.stringify(sug.data, null, 2).slice(0, 2500));
    } else {
        console.log('4) (skip) suggest-quote-line — задай --product-id и --client-id');
    }

    if (hasFlag('skip-preview')) {
        console.log('5) (skip) publish-preview');
    } else if (clientId) {
        console.log('5) POST /api/pfp/resolut/publish-preview (пустой quotes → ожидаем 400 или валидация)');
        const prev = await http.post(
            '/api/pfp/resolut/publish-preview',
            { client_id: Number(clientId), quotes: [] },
            { headers: auth }
        );
        console.log('   status', prev.status);
        console.log('   body', JSON.stringify(prev.data, null, 2).slice(0, 1500));
    } else {
        console.log('5) (skip) publish-preview — задай --client-id или используй реальные quotes вручную');
    }

    console.log('\nГотово. Для полного цикла добавь --client-id и --product-id с Resolut-продуктом в БД.');
}

main().catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
});
