const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-jwt-secret';

const authService = require('../../src/services/authService');

test('signGuestClientToken issues client JWT with guest flag', () => {
    const token = authService.signGuestClientToken({
        clientId: 42,
        projectId: 2,
        email: 'lead@example.com',
    });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.role, 'client');
    assert.equal(decoded.guest, true);
    assert.equal(decoded.clientId, 42);
    assert.equal(decoded.projectId, 2);
    assert.equal(decoded.email, 'lead@example.com');
    assert.ok(!decoded.user_id);
});

test('signGuestClientToken rejects invalid clientId', () => {
    assert.throws(
        () => authService.signGuestClientToken({ clientId: 0, projectId: 2 }),
        (err) => err && err.status === 400
    );
});
