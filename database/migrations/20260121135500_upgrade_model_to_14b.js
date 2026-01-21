/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    //Upgrade all assistants using the old 7B model to the new 14B model
    await knex('ai_assistants')
        .where('model', 'Qwen/Qwen2.5-7B-Instruct')
        .update({
            model: 'Qwen/Qwen2.5-14B-Instruct',
            updated_at: knex.fn.now()
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    // Revert 14B back to 7B (if we ever need to downgrade)
    await knex('ai_assistants')
        .where('model', 'Qwen/Qwen2.5-14B-Instruct')
        .update({
            model: 'Qwen/Qwen2.5-7B-Instruct'
        });
};
