const db = require('../config/database');

function normalizeRegistrationEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase();
}

function buildReleasedUserEmail(userId) {
    return `deleted.user${userId}.${Date.now()}@pfp-deleted.invalid`;
}

/**
 * Active user with this email in the project blocks registration.
 * @param {string} email
 * @param {number} projectId
 */
async function assertActiveUserEmailAvailable(email, projectId) {
    const normalized = normalizeRegistrationEmail(email);
    const pid = Number(projectId);
    if (!normalized || !Number.isFinite(pid) || pid <= 0) {
        throw { status: 400, message: 'Некорректный email или проект' };
    }

    const existing = await db('users').where({ email: normalized, project_id: pid }).first();
    if (existing?.is_active) {
        throw {
            status: 400,
            message: 'Пользователь с таким email уже существует в этом проекте',
        };
    }
}

/**
 * Remove inactive user (and linked agent) so the email can be reused in the same project.
 */
async function purgeInactiveUserForEmail(email, projectId, trx = db) {
    const normalized = normalizeRegistrationEmail(email);
    const pid = Number(projectId);
    if (!normalized || !Number.isFinite(pid)) return;

    const existing = await trx('users')
        .where({ email: normalized, project_id: pid, is_active: false })
        .first();
    if (!existing) return;

    if (existing.agent_id != null) {
        await trx('agents').where({ id: existing.agent_id, project_id: pid }).del();
    }
    await trx('users').where({ id: existing.id }).del();
}

/**
 * On soft-delete: free email for reuse (global unique legacy rows included).
 */
async function releaseUserEmailOnDeactivation(userRow, trx = db) {
    if (!userRow?.id || !userRow?.email) return;
    const released = buildReleasedUserEmail(userRow.id);
    await trx('users').where({ id: userRow.id }).update({
        email: released,
        is_active: false,
        updated_at: new Date(),
    });
}

module.exports = {
    normalizeRegistrationEmail,
    buildReleasedUserEmail,
    assertActiveUserEmailAvailable,
    purgeInactiveUserForEmail,
    releaseUserEmailOnDeactivation,
};
