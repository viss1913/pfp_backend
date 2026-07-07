const knex = require('../config/database');

/**
 * Один бот на проект (telegram/max): любой агент project_id управляет общей записью.
 * agent_id в строке — для CRM/legacy, не для изоляции доступа в ЛК.
 */

async function findProjectBot(projectId, botType = 'telegram') {
    const pid = Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return null;

    let bot = await knex('constructor_bots')
        .where({ project_id: pid, bot_type: botType })
        .orderByRaw('is_active DESC, id ASC')
        .first();

    if (bot) return bot;

    return knex('constructor_bots')
        .join('agents', 'constructor_bots.agent_id', 'agents.id')
        .where('agents.project_id', pid)
        .where('constructor_bots.bot_type', botType)
        .select('constructor_bots.*')
        .orderByRaw('constructor_bots.is_active DESC, constructor_bots.id ASC')
        .first();
}

async function listProjectMessengerBots(projectId) {
    const pid = Number(projectId);
    if (!Number.isFinite(pid) || pid <= 0) return [];

    const byProject = await knex('constructor_bots')
        .where('project_id', pid)
        .whereNot('bot_type', 'site')
        .orderBy('created_at', 'desc');

    if (byProject.length) return byProject;

    return knex('constructor_bots')
        .join('agents', 'constructor_bots.agent_id', 'agents.id')
        .where('agents.project_id', pid)
        .whereNot('constructor_bots.bot_type', 'site')
        .select('constructor_bots.*')
        .orderBy('constructor_bots.created_at', 'desc');
}

async function projectBotIds(projectId) {
    const bots = await listProjectMessengerBots(projectId);
    return bots.map((b) => b.id);
}

async function clientBelongsToProject(clientId, projectId) {
    const ids = await projectBotIds(projectId);
    if (!ids.length) return null;

    const client = await knex('constructor_clients').where('id', clientId).first();
    if (!client || !ids.includes(client.bot_id)) return null;
    return client;
}

module.exports = {
    findProjectBot,
    listProjectMessengerBots,
    projectBotIds,
    clientBelongsToProject,
};
