const knex = require('knex')(require('../../knexfile').development);

class AiAssistantService {
    async getAll() {
        return knex('ai_assistants').select('*');
    }

    async getById(id) {
        return knex('ai_assistants').where({ id }).first();
    }

    async getActive() {
        return knex('ai_assistants').where({ is_active: true }).select('id', 'name', 'slug', 'context_template');
    }

    async create(data) {
        const [id] = await knex('ai_assistants').insert({
            name: data.name,
            slug: data.slug,
            context_template: data.context_template,
            model: data.model || 'google/gemini-2.0-flash-exp:free',
            is_active: data.is_active !== undefined ? data.is_active : true
        });
        return this.getById(id);
    }

    async update(id, data) {
        await knex('ai_assistants').where({ id }).update({
            name: data.name,
            context_template: data.context_template,
            model: data.model,
            is_active: data.is_active,
            updated_at: knex.fn.now()
        });
        return this.getById(id);
    }

    async delete(id) {
        return knex('ai_assistants').where({ id }).del();
    }
}

module.exports = new AiAssistantService();
