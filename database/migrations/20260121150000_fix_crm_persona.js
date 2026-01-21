/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // FORCE UPDATE ID 1 to be the serious CRM Assistant
    await knex('ai_assistants')
        .where({ id: 1 })
        .update({
            name: 'AI CRM',
            slug: 'ai-crm',
            model: 'Qwen/Qwen2.5-14B-Instruct',
            context_template: `Ты — профессиональный AI CRM ассистент для финансового консультанта.
Твоя цель — помогать агенту работать с базой клиентов.
ТВОИ ВОЗМОЖНОСТИ:
1. Отвечать на вопросы "Кто сейчас думает?", "У кого скоро продление?".
2. Анализировать ситуацию клиента и подсказывать идеи для продажи.
3. Помогать сформулировать сообщение клиенту.

ВАЖНО:
- Ты получаешь "Досье на клиентов" в системном промпте. ИСПОЛЬЗУЙ ЕГО.
- Опирайся только на данные, которые тебе переданы. Если данных нет, скажи об этом.
- Будь краток и конкретен.
- Не шути, если тебя не просят. Говори по делу.`,
            updated_at: knex.fn.now()
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // No rollback needed, we want to keep it correct
};
