#!/usr/bin/env node
/* eslint-disable no-console */
const axios = require('axios');

function getArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    if (!hit) return fallback;
    return hit.slice(prefix.length);
}

async function main() {
    const baseUrl = (getArg('base-url', process.env.RESOLUT_BASE_URL || 'https://demo.avinfors.ru/pfp/api/pfp/') || '').replace(/\/$/, '');
    const key = getArg('key', process.env.RESOLUT_STATIC_KEY || '');
    const timeoutMs = Number(getArg('timeout-ms', process.env.RESOLUT_TIMEOUT_MS || '10000'));

    if (!baseUrl) {
        throw new Error('Missing base URL. Set --base-url or RESOLUT_BASE_URL');
    }
    if (!key) {
        throw new Error('Missing bearer key. Set --key or RESOLUT_STATIC_KEY');
    }

    const payload = {
        operation: 'products',
        data: {}
    };

    console.log('Resolut products request');
    console.log(`URL: ${baseUrl}/`);
    console.log('Method: POST');
    console.log(`Timeout: ${timeoutMs} ms`);
    console.log('Headers: Content-Type=application/json, Authorization=Bearer <masked>');
    console.log('Body:', JSON.stringify(payload));

    try {
        const response = await axios.post(`${baseUrl}/`, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`
            },
            timeout: timeoutMs
        });

        console.log('\nStatus:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
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
