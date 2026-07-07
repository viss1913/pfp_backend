/**
 * Регистрация/обновление telegram-бота конструктора из env (для Immers и локали).
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN или telegram_bot — токен @BotFather
 *   CONSTRUCTOR_BOT_AGENT_ID (default 2)
 *   CONSTRUCTOR_BOT_PROJECT_ID (default 2)
 *   CONSTRUCTOR_BOT_NAME (default BankFuture Bot)
 *
 * Usage: node scripts/upsert_telegram_constructor_bot.js
 */
require('dotenv').config();
const knex = require('../src/config/database');

const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot || '').trim();
const projectId = parseInt(process.env.CONSTRUCTOR_BOT_PROJECT_ID || '2', 10);
const agentId = parseInt(process.env.CONSTRUCTOR_BOT_AGENT_ID || '2', 10);
const botName = (process.env.CONSTRUCTOR_BOT_NAME || 'BankFuture Bot').trim();
const { findProjectBot } = require('../src/utils/constructorProjectBot');

async function ensureProjectTemplates(targetProjectId) {
    const countRow = await knex('constructor_commands')
        .where({ is_template: true, project_id: targetProjectId })
        .count('* as c')
        .first();
    if (parseInt(countRow.c, 10) > 0) return 0;

    const donorProjectId = targetProjectId === 1 ? null : 1;
    if (donorProjectId == null) return 0;

    const templates = await knex('constructor_commands').where({
        is_template: true,
        project_id: donorProjectId,
    });
    if (!templates.length) {
        console.warn(`[upsert_telegram_bot] no template commands in project_id=${donorProjectId}`);
        return 0;
    }

    for (const row of templates) {
        const { id, created_at, updated_at, ...rest } = row;
        await knex('constructor_commands').insert({
            ...rest,
            project_id: targetProjectId,
            bot_id: null,
        });
    }
    return templates.length;
}

async function main() {
    if (!token) {
        console.error('[upsert_telegram_bot] Set TELEGRAM_BOT_TOKEN or telegram_bot in env');
        process.exit(1);
    }

    const agent = await knex('agents').where('id', agentId).first();
    if (!agent) {
        console.error(`[upsert_telegram_bot] agent id=${agentId} not found`);
        process.exit(1);
    }

    const copied = await ensureProjectTemplates(projectId);
    if (copied) console.log(`[upsert_telegram_bot] copied ${copied} template commands to project_id=${projectId}`);

    let bot = await findProjectBot(projectId, 'telegram');

    if (bot) {
        await knex('constructor_bots').where('id', bot.id).update({
            name: botName,
            token,
            is_active: true,
            project_id: projectId,
            updated_at: knex.fn.now(),
        });
        console.log(`[upsert_telegram_bot] updated project bot id=${bot.id} project_id=${projectId}`);
    } else {
        const [id] = await knex('constructor_bots').insert({
            agent_id: agentId,
            project_id: projectId,
            bot_type: 'telegram',
            name: botName,
            token,
            is_active: true,
            communication_style: 'Дружелюбный и понятный финансовый помощник.',
            base_brain_context: 'Ты — AI-помощник BankFuture PFP по финансовому планированию и целям клиента.',
        });
        bot = { id };
        console.log(`[upsert_telegram_bot] created project bot id=${id} project_id=${projectId}`);
    }

    console.log('[upsert_telegram_bot] done — restart backend: docker compose restart backend');
    process.exit(0);
}

main().catch((err) => {
    console.error('[upsert_telegram_bot] FAIL:', err.message || err);
    process.exit(1);
});
