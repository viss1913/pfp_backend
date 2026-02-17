/**
 * Migration: Add client role + email_verifications table
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // 1. Add 'client' to users.role enum
    await knex.raw(`ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','admin','agent','client') NOT NULL DEFAULT 'agent'`);

    // 2. Create email_verifications table for code-based registration
    await knex.schema.createTable('email_verifications', (table) => {
        table.bigIncrements('id').primary();
        table.string('email', 255).notNullable();
        table.string('code', 6).notNullable();
        table.bigInteger('project_id').unsigned().nullable()
            .references('id').inTable('projects').onDelete('CASCADE');
        table.string('name', 255).nullable();
        table.datetime('expires_at').notNullable();
        table.boolean('verified').defaultTo(false);
        table.timestamps(true, true);

        table.index(['email', 'code']);
        table.index(['expires_at']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('email_verifications');
    await knex.raw(`ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','admin','agent') NOT NULL DEFAULT 'agent'`);
};
