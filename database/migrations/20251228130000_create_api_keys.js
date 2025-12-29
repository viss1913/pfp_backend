/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('api_keys', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('agent_id').unsigned().notNullable()
            .references('id').inTable('agents').onDelete('CASCADE');

        table.string('prefix', 32).notNullable().index()
            .comment('Public prefix + ID for lookup (e.g. pk_live_abc123)');
        table.string('key_hash', 255).notNullable()
            .comment('Bcrypt hash of the full key');
        table.string('name', 100).nullable()
            .comment('Friendly name for the key');

        table.boolean('is_active').defaultTo(true);
        table.timestamp('last_used_at').nullable();
        table.timestamp('expires_at').nullable();

        table.timestamps(true, true);

        // Compound index for faster lookups if needed, though prefix index is usually enough
        table.index(['agent_id', 'is_active']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('api_keys');
};
