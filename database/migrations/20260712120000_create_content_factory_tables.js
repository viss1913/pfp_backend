/**
 * Content Factory: HTML templates, offers, AI chat, agent presentations.
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('content_templates', (table) => {
        table.increments('id').primary();
        table.integer('project_id').unsigned().notNullable().index();
        table.string('title', 255).notNullable();
        table.text('description').nullable();
        table.text('html_source').notNullable();
        table.json('slots').nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamps(true, true);
    });

    await knex.schema.createTable('content_offers', (table) => {
        table.increments('id').primary();
        table.integer('project_id').unsigned().notNullable().index();
        table
            .integer('template_id')
            .unsigned()
            .nullable()
            .references('id')
            .inTable('content_templates')
            .onDelete('SET NULL');
        table.string('title', 255).notNullable();
        table.string('kind', 64).notNullable().defaultTo('product');
        table.json('payload').nullable();
        table.string('cta_url_base', 2048).nullable();
        table.string('cta_label', 255).nullable();
        table.text('generated_html').nullable();
        table.string('status', 32).notNullable().defaultTo('draft'); // draft | published | archived
        table.timestamp('expires_at').nullable().index();
        table.timestamp('published_at').nullable();
        table.bigInteger('created_by_user_id').unsigned().nullable();
        table.timestamps(true, true);
        table.index(['project_id', 'status']);
    });

    await knex.schema.createTable('content_offer_chat_messages', (table) => {
        table.bigIncrements('id').primary();
        table
            .integer('offer_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('content_offers')
            .onDelete('CASCADE');
        table.integer('project_id').unsigned().notNullable().index();
        table.string('role', 32).notNullable(); // user | assistant | system
        table.text('content').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.index(['offer_id', 'created_at']);
    });

    await knex.schema.createTable('agent_presentations', (table) => {
        table.increments('id').primary();
        table.integer('project_id').unsigned().notNullable().index();
        table.bigInteger('agent_id').unsigned().notNullable().index();
        table.string('title', 255).notNullable();
        table.json('offer_ids').notNullable(); // ordered [1,2,3]
        table.string('status', 32).notNullable().defaultTo('draft'); // draft | ready | sent
        table.bigInteger('recipient_client_id').unsigned().nullable();
        table.string('email_subject', 512).nullable();
        table.text('email_body').nullable();
        table.string('pdf_storage_key', 1024).nullable();
        table.text('pdf_html_snapshot').nullable();
        table.timestamps(true, true);
        table.index(['project_id', 'agent_id']);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('agent_presentations');
    await knex.schema.dropTableIfExists('content_offer_chat_messages');
    await knex.schema.dropTableIfExists('content_offers');
    await knex.schema.dropTableIfExists('content_templates');
};
