#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Прямой вызов Resolut quote (демо). Пример: assetShort после правок партнёра по рискам.
 *
 * node scripts/test_resolut_quote.js --key=<bearer после authorize>
 * node scripts/test_resolut_quote.js --key=... --code=assetShort --variant=flat
 * node scripts/test_resolut_quote.js --key=... --variant=openapi
 *
 * Свои цифры (flat/openapi):
 *   --limit=2000000 --term=15 --dob=26.04.1981 --sex=male --p-type=12
 *   --monthly-income=200000  (опционально, в calcData.monthlyIncome — если партнёр поддержит)
 */
const axios = require('axios');

function getArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    if (!hit) return fallback;
    return hit.slice(prefix.length);
}

function parseNumberArg(name, fallback) {
    const raw = getArg(name, null);
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

/** ДД.ММ.ГГГГ для «возраст на сегодня» (локальная дата). */
function dobFromAge(ageYears) {
    const a = parseInt(String(ageYears), 10);
    if (!Number.isFinite(a) || a < 1 || a > 120) return null;
    const d = new Date();
    d.setFullYear(d.getFullYear() - a);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function buildParameters(variant) {
    const limit = parseNumberArg('limit', 1000000);
    const term = parseNumberArg('term', 5);
    const pTypeFlat = parseInt(String(getArg('p-type', '0')), 10);
    const sex = (getArg('sex', 'male') || 'male').toLowerCase();
    const dob =
        getArg('dob', null) ||
        dobFromAge(getArg('age', null)) ||
        '01.01.1985';
    const monthlyIncomeRaw = getArg('monthly-income', null);
    const monthlyIncome =
        monthlyIncomeRaw != null && monthlyIncomeRaw !== '' ? Number(monthlyIncomeRaw) : null;

    const calcData = {
        valuationType: 'byLimit',
        limit
    };
    if (Number.isFinite(monthlyIncome) && monthlyIncome > 0) {
        calcData.monthlyIncome = monthlyIncome;
    }

    if (variant === 'openapi') {
        const pName =
            pTypeFlat === 12
                ? 'ежемесячно'
                : pTypeFlat === 0
                  ? 'единовременно'
                  : `код_${pTypeFlat}`;
        return {
            currency: { code: 'RUR', name: 'Рубль РФ' },
            pType: { code: pTypeFlat, name: pName },
            term,
            insuredPerson: {
                dob,
                sex: sex === 'female' || sex === 'f' ? 'female' : 'male'
            },
            calcData
        };
    }
    // как в docs/partners/report-first-integration.md (плоский вид)
    return {
        currency: 'RUR',
        pType: pTypeFlat,
        term,
        insuredPerson: {
            dob,
            sex: sex === 'female' || sex === 'f' ? 'female' : 'male'
        },
        calcData
    };
}

async function main() {
    const baseUrl = (getArg('base-url', process.env.RESOLUT_BASE_URL || 'https://demo.avinfors.ru/pfp/api/pfp/') || '').replace(/\/$/, '');
    const timeoutMs = Number(getArg('timeout-ms', process.env.RESOLUT_TIMEOUT_MS || '10000'));
    let key = getArg('key', process.env.RESOLUT_STATIC_KEY || '');
    const login = getArg('login', null);
    const password = getArg('password', null);
    const code = getArg('code', 'assetShort');
    const variant = (getArg('variant', 'flat') || 'flat').toLowerCase();

    if (!baseUrl) {
        throw new Error('Missing base URL. Set --base-url or RESOLUT_BASE_URL');
    }
    if (!key && login && password) {
        const authRes = await axios.post(
            `${baseUrl}/`,
            {
                operation: 'authorize',
                data: {
                    login,
                    password,
                    type: getArg('auth-type', 'ПользовательРезолют')
                }
            },
            { timeout: timeoutMs, validateStatus: () => true }
        );
        if (authRes.status !== 200 || !authRes.data?.data?.key) {
            console.error('authorize failed:', authRes.status, JSON.stringify(authRes.data, null, 2));
            process.exitCode = 1;
            return;
        }
        key = authRes.data.data.key;
        console.log('authorize: ok (bearer получен)\n');
    }
    if (!key) {
        throw new Error('Missing bearer: --key / RESOLUT_STATIC_KEY или пара --login / --password');
    }

    const parameters = buildParameters(variant === 'openapi' ? 'openapi' : 'flat');
    const payload = {
        operation: 'quote',
        data: {
            code,
            parameters
        }
    };

    console.log('Resolut quote request');
    console.log(`URL: ${baseUrl}/`);
    console.log(`Product code: ${code}`);
    console.log(`Parameters variant: ${variant === 'openapi' ? 'openapi (nested currency/pType)' : 'flat (как в отчёте интеграции)'}`);
    console.log(`Timeout: ${timeoutMs} ms`);
    console.log('Body:', JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(`${baseUrl}/`, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`
            },
            timeout: timeoutMs,
            validateStatus: () => true
        });

        console.log('\nStatus:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        if (response.status >= 400) {
            process.exitCode = 1;
        }
    } catch (error) {
        if (error.response) {
            console.error('\nStatus:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('\nTransport error:', error.message);
        }
        process.exitCode = 1;
    }
}

main();
