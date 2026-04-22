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
    const login = getArg('login', process.env.RESOLUT_AGENT_LOGIN || 'agent@agent.ru');
    const password = getArg('password', process.env.RESOLUT_AGENT_PASSWORD || '1234');
    const type = getArg('type', process.env.RESOLUT_AUTH_TYPE || 'ПользовательРезолют');
    const timeoutMs = Number(getArg('timeout-ms', process.env.RESOLUT_TIMEOUT_MS || '10000'));

    if (!baseUrl) {
        throw new Error('Missing base URL. Set --base-url or RESOLUT_BASE_URL');
    }
    if (!login || !password) {
        throw new Error('Missing login/password. Set args or env vars.');
    }

    const payload = {
        operation: 'authorize',
        data: { login, password, type }
    };

    console.log('Resolut authorize request');
    console.log(`URL: ${baseUrl}/`);
    console.log('Method: POST');
    console.log(`Timeout: ${timeoutMs} ms`);
    console.log('Body:', JSON.stringify(payload));

    try {
        const response = await axios.post(`${baseUrl}/`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs
        });

        console.log('\nStatus:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));

        if (response.data && response.data.data && response.data.data.key) {
            console.log('\nExtracted key:', response.data.data.key);
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
