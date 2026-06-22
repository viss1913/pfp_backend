process.env.TELEGRAM_API_TIMEOUT_MS = '20';
process.env.TELEGRAM_API_RETRIES = '3';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isRetryableTelegramError,
    isUncertainTelegramDeliveryError,
    callTelegramApi,
} = require('../src/utils/telegramSend');

test('isRetryableTelegramError: no retry on client response timeout', () => {
    const err = new Error('Telegram API timeout: sendMessage chat=1 (45000ms)');
    assert.equal(isRetryableTelegramError(err), false);
    assert.equal(isUncertainTelegramDeliveryError(err), true);
});

test('isRetryableTelegramError: retry on connection reset', () => {
    const err = new Error('read ECONNRESET');
    assert.equal(isRetryableTelegramError(err), true);
    assert.equal(isUncertainTelegramDeliveryError(err), false);
});

test('isRetryableTelegramError: retry on HTTP 502', () => {
    const err = new Error('Bad Gateway');
    err.response = { statusCode: 502 };
    assert.equal(isRetryableTelegramError(err), true);
});

test('callTelegramApi does not retry sendMessage after timeout', async () => {
    let calls = 0;
    await assert.rejects(
        callTelegramApi(
            () => {
                calls += 1;
                return new Promise(() => {});
            },
            'sendMessage chat=1',
            { maxRetries: 3 }
        ),
        /Telegram API timeout: sendMessage chat=1/
    );
    assert.equal(calls, 1);
});

test('callTelegramApi retries getMe on timeout when retryOnTimeout=true', async () => {
    let calls = 0;
    await assert.rejects(
        callTelegramApi(
            () => {
                calls += 1;
                return new Promise(() => {});
            },
            'getMe bot=1',
            { maxRetries: 3, retryOnTimeout: true }
        ),
        /Telegram API timeout: getMe bot=1/
    );
    assert.equal(calls, 3);
});
