#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Прямой вызов Resolut quote (демо). Пример: assetShort после правок партнёра по рискам.
 *
 * node scripts/test_resolut_quote.js --key=<bearer после authorize>
 * node scripts/test_resolut_quote.js --key=... --code=assetShort --variant=flat
 * node scripts/test_resolut_quote.js --key=... --variant=openapi
 */
const axios = require('axios');

function getArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    if (!hit) return fallback;
    return hit.slice(prefix.length);
}

function buildParameters(variant) {
    if (variant === 'openapi') {
        return {
            currency: { code: 'RUR', name: 'Рубль РФ' },
            pType: { code: 0, name: 'ежемесячно' },
            term: 5,
            insuredPerson: {
                dob: '01.01.1985',
                sex: 'male'
            },
            calcData: {
                valuationType: 'byLimit',
                limit: 1000000
            }
        };
    }
    // как в docs/partners/report-first-integration.md
    return {
        currency: 'RUR',
        pType: 0,
        term: 5,
        insuredPerson: {
            dob: '01.01.1985',
            sex: 'male'
        },
        calcData: {
            valuationType: 'byLimit',
            limit: 1000000
        }
    };
}

async function main() {
    const baseUrl = (getArg('base-url', process.env.RESOLUT_BASE_URL || 'https://demo.avinfors.ru/pfp/api/pfp/') || '').replace(/\/$/, '');
    const key = getArg('key', process.env.RESOLUT_STATIC_KEY || '');
    const code = getArg('code', 'assetShort');
    const variant = (getArg('variant', 'flat') || 'flat').toLowerCase();
    const timeoutMs = Number(getArg('timeout-ms', process.env.RESOLUT_TIMEOUT_MS || '10000'));

    if (!baseUrl) {
        throw new Error('Missing base URL. Set --base-url or RESOLUT_BASE_URL');
    }
    if (!key) {
        throw new Error('Missing bearer key. Set --key or RESOLUT_STATIC_KEY (или ключ из ответа authorize).');
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
