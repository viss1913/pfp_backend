const projectRepository = require('../repositories/projectRepository');
const { parseProjectSettings } = require('./projectSettings');

/**
 * @param {object|null|undefined} settings
 * @returns {boolean}
 */
function projectAllowsAgentsSeeAllClients(settings) {
    const s = parseProjectSettings(settings);
    return s.agents_see_all_clients === true || s.client_visibility === 'all';
}

/**
 * @param {number|null} projectId
 * @returns {Promise<boolean>}
 */
async function loadProjectAllowsSeeAllClients(projectId) {
    if (!projectId) return false;
    const project = await projectRepository.findById(projectId);
    return projectAllowsAgentsSeeAllClients(project?.settings);
}

/**
 * Проверка права агента изменять карточку клиента (scope как у GET /pfp/clients).
 * @throws {{ status: number, message: string }}
 */
async function assertAgentCanMutateClient({ req, client, projectId }) {
    if (!client) {
        const err = new Error('Client not found');
        err.status = 404;
        throw err;
    }

    const role = String(req?.user?.role || '').toLowerCase();
    if (role === 'admin' || role === 'super_admin') {
        return;
    }

    const requesterAgentId = Number(req?.user?.agentId);
    const ownerAgentId = Number(client.agent_id);

    const seeAll = await loadProjectAllowsSeeAllClients(projectId);
    if (seeAll) {
        return;
    }

    if (
        Number.isFinite(requesterAgentId) &&
        requesterAgentId > 0 &&
        Number.isFinite(ownerAgentId) &&
        ownerAgentId > 0 &&
        requesterAgentId === ownerAgentId
    ) {
        return;
    }

    if (!Number.isFinite(ownerAgentId) || ownerAgentId <= 0) {
        return;
    }

    const err = new Error('Access denied');
    err.status = 403;
    throw err;
}

module.exports = {
    projectAllowsAgentsSeeAllClients,
    loadProjectAllowsSeeAllClients,
    assertAgentCanMutateClient,
};
