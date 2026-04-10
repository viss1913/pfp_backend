const knex = require('../config/database');
const clientService = require('./clientService');

/**
 * У site-бота иногда в БД пустой agent_id (расчёт идёт по project_id, а CRM/persist без agent_id падают).
 * Подставляем первого агента проекта и сохраняем в constructor_bots.
 */
async function backfillConstructorBotAgentId(bot) {
    if (!bot?.id || !bot.project_id || bot.agent_id) return bot;
    const agent = await knex('agents').where({ project_id: bot.project_id }).orderBy('id', 'asc').first();
    if (!agent) {
        console.error(
            `[ConstructorCRM] bot ${bot.id}: project_id=${bot.project_id} but no agents row — cannot set agent_id`
        );
        return bot;
    }
    await knex('constructor_bots')
        .where({ id: bot.id })
        .update({ agent_id: agent.id, updated_at: knex.fn.now() });
    console.warn(
        `[ConstructorCRM] bot ${bot.id}: had null agent_id — backfilled agent_id=${agent.id} (first agent in project ${bot.project_id})`
    );
    return { ...bot, agent_id: agent.id };
}

/**
 * Создаёт запись в `clients` и проставляет `constructor_clients.pfp_client_id`,
 * чтобы диалог site-chat (`/pfp/constructor/site-chat/stream`) был виден в ЛК агента с первого сообщения,
 * без ожидания first-run расчёта.
 */
async function ensurePfpClientLinkedForConstructorSiteChat(constructorClientRow, bot, nickname) {
    if (!constructorClientRow?.id) return null;
    if (constructorClientRow.pfp_client_id) return Number(constructorClientRow.pfp_client_id);
    if (!bot?.project_id || !bot?.agent_id) return null;

    const nick = String(nickname || '')
        .trim()
        .replace(/^@/, '')
        .slice(0, 100);
    const firstName = nick || 'Сайт';

    const clientId = await clientService.createFullClient({
        client: {
            project_id: bot.project_id,
            agent_id: bot.agent_id,
            first_name: firstName,
            last_name: ' ',
            birth_date: '1990-01-01',
            gender: 'male',
            avg_monthly_income: 100000,
            total_liquid_capital: 0,
        },
        goals: [],
    });

    await knex('constructor_clients')
        .where('id', constructorClientRow.id)
        .update({
            pfp_client_id: clientId,
            updated_at: knex.fn.now(),
        });

    return clientId;
}

module.exports = {
    ensurePfpClientLinkedForConstructorSiteChat,
    backfillConstructorBotAgentId,
};
