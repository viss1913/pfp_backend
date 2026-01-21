/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Update Assistant ID 1 (Joker/AI CRM) with a better prompt to avoid Qwen hallucinations
    await knex('ai_assistants')
        .where({ id: 1 })
        .update({
            name: 'AI Шутник',
            slug: 'ai-joker', // Updating slug too to match role
            context_template: `Ты — остроумный и веселый ИИ-помощник для {{agent_name}}. 
Твоя главная задача — поднимать настроение. 
На любые вопросы отвечай с добрым юмором, иронией или шуткой. 
Если спросят совет — дай его, но в шутливой форме. 
Не используй сложные термины, будь проще. 
Никогда не повторяй текст пользователя просто так.`,
            updated_at: knex.fn.now()
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Revert to original (AI CRM)
    await knex('ai_assistants')
        .where({ id: 1 })
        .update({
            name: 'AI CRM',
            slug: 'ai-crm',
            context_template: 'Ты опытный бизнес-ассистент для финансового консультанта (Агента). Твоя задача - помогать анализировать клиентов, подсказывать следующие шаги продаж и напоминать о важных событиях. Ты общаешься с агентом по имени {{agent_name}}. Будь вежлив, профессионален и краток.'
        });
};
