const knexConfig = require('../../knexfile');
const knexEnv = process.env.NODE_ENV || 'development';
const knex = require('knex')(knexConfig[knexEnv] || knexConfig.development);

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
            // Default values
            model: data.model || 'Qwen/Qwen2.5-14B-Instruct',
            temperature: data.temperature || 0.7,
            max_tokens: data.max_tokens || 1000,
            is_active: data.is_active !== undefined ? data.is_active : true,
            created_at: knex.fn.now()
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
