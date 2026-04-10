const knex = require('../config/database');
const clientService = require('./clientService');

/**
 * Подготовка constructor_bots к CRM/persist.
 *
 * 1) CONSTRUCTOR_BACKFILL_AGENT_ID — если задан, ВСЕГДА выравниваем agent_id под этого агента
 *    (раньше при непустом agent_id мы выходили сразу — env не работал).
 *    Агент должен существовать; project_id бота должен совпадать с project_id агента,
 *    либо у бота project_id NULL — тогда подставляем project_id с карточки агента.
 * 2) Иначе при пустом agent_id — первый агент проекта.
 */
async function backfillConstructorBotAgentId(bot) {
    if (!bot?.id) return bot;

    let next = { ...bot };
    const forcedRaw = parseInt(String(process.env.CONSTRUCTOR_BACKFILL_AGENT_ID || '').trim(), 10);

    if (Number.isFinite(forcedRaw) && forcedRaw > 0) {
        const agent = await knex('agents').where({ id: forcedRaw }).first();
        if (!agent) {
            console.error(`[ConstructorCRM] CONSTRUCTOR_BACKFILL_AGENT_ID=${forcedRaw}: нет строки в agents`);
        } else {
            const ap = Number(agent.project_id);
            const bp = next.project_id != null && next.project_id !== '' ? Number(next.project_id) : null;

            if (bp != null && !Number.isNaN(bp) && bp !== ap) {
                console.error(
                    `[ConstructorCRM] агент ${forcedRaw} в project_id=${ap}, бот ${next.id} в project_id=${bp} — не совпадают. Поправь constructor_bots.project_id или убери CONSTRUCTOR_BACKFILL_AGENT_ID.`
                );
            } else {
                const needAgent = Number(next.agent_id) !== forcedRaw;
                const needProject = (next.project_id == null || next.project_id === '') && agent.project_id != null;

                if (needAgent || needProject) {
                    const updates = { updated_at: knex.fn.now() };
                    if (needAgent) updates.agent_id = forcedRaw;
                    if (needProject) updates.project_id = agent.project_id;
                    await knex('constructor_bots').where({ id: next.id }).update(updates);
                    console.warn(
                        `[ConstructorCRM] bot ${next.id}: CONSTRUCTOR_BACKFILL_AGENT_ID=${forcedRaw}` +
                            (needAgent ? ` agent_id ${next.agent_id ?? 'null'}→${forcedRaw}` : '') +
                            (needProject ? ` project_id→${agent.project_id}` : '')
                    );
                }
                next = {
                    ...next,
                    agent_id: forcedRaw,
                    project_id: next.project_id ?? agent.project_id,
                };
                return next;
            }
        }
    }

    if (next.project_id == null || next.project_id === '') {
        console.error(
            `[ConstructorCRM] bot ${next.id}: project_id пустой и CONSTRUCTOR_BACKFILL_AGENT_ID не помог — persist/CRM не взлетят`
        );
        return next;
    }

    if (next.agent_id) return next;

    const agent = await knex('agents').where({ project_id: next.project_id }).orderBy('id', 'asc').first();
    if (!agent) {
        console.error(
            `[ConstructorCRM] bot ${next.id}: project_id=${next.project_id}, но нет ни одного agents — cannot set agent_id`
        );
        return next;
    }
    await knex('constructor_bots')
        .where({ id: next.id })
        .update({ agent_id: agent.id, updated_at: knex.fn.now() });
    console.warn(
        `[ConstructorCRM] bot ${next.id}: был пустой agent_id — backfill agent_id=${agent.id} (первый агент проекта ${next.project_id})`
    );
    return { ...next, agent_id: agent.id };
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
