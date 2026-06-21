const knex = require('../config/database');

function resolveProjectId(req) {
    const raw = req.projectId || req.user?.projectId;
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function canManageProjectTemplates(req) {
    return !!(req.user?.isAdmin || req.user?.isSuperAdmin);
}

async function findBotInProject(botId, projectId) {
    const id = Number(botId);
    if (!Number.isFinite(id) || id <= 0) return null;

    let bot = await knex('constructor_bots').where({ id, project_id: projectId }).first();
    if (bot) return bot;

    return knex('constructor_bots')
        .join('agents', 'constructor_bots.agent_id', 'agents.id')
        .where('constructor_bots.id', id)
        .where('agents.project_id', projectId)
        .select('constructor_bots.*')
        .first();
}

async function findCommandInProject(commandId, projectId) {
    const id = Number(commandId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const row = await knex('constructor_commands').where('id', id).first();
    if (!row) return null;

    if (row.is_template && Number(row.project_id) === projectId) return row;

    if (row.bot_id) {
        const bot = await findBotInProject(row.bot_id, projectId);
        if (bot) return row;
    }

    return null;
}

module.exports = {
    resolveProjectId,
    canManageProjectTemplates,
    findBotInProject,
    findCommandInProject,
};
