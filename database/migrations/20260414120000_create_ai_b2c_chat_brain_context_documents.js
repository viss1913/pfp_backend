exports.up = async function (knex) {
    const exists = await knex.schema.hasTable('ai_b2c_chat_brain_context_documents');
    if (exists) {
        return;
    }

    await knex.schema.createTable('ai_b2c_chat_brain_context_documents', (table) => {
        table.increments('id').primary();
        table.bigInteger('brain_context_id').unsigned().notNullable();
        table.bigInteger('project_id').unsigned().nullable();
        table.string('original_filename', 255).notNullable();
        table.string('mime_type', 191).nullable();
        table.bigInteger('size_bytes').unsigned().nullable();
        table.longtext('extracted_text').notNullable();
        table.integer('text_length').unsigned().notNullable().defaultTo(0);
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamps(true, true);

        table
            .foreign('brain_context_id')
            .references('id')
            .inTable('ai_b2c_chat_brain_contexts')
            .onDelete('CASCADE');
        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');

        table.index(['brain_context_id', 'is_active'], 'idx_chat_ai_doc_context_active');
        table.index(['project_id', 'is_active'], 'idx_chat_ai_doc_project_active');
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('ai_b2c_chat_brain_context_documents');
};
