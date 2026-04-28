/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasClientCode = await knex.schema.hasColumn('clients', 'resolut_client_code');
    const hasClientSyncedAt = await knex.schema.hasColumn('clients', 'resolut_client_synced_at');

    await knex.schema.alterTable('clients', (table) => {
        if (!hasClientCode) {
            table.string('resolut_client_code', 64).nullable().index();
        }
        if (!hasClientSyncedAt) {
            table.timestamp('resolut_client_synced_at').nullable();
        }
    });

    const hasPublicationsTable = await knex.schema.hasTable('resolut_portfolio_publications');
    if (!hasPublicationsTable) {
        await knex.schema.createTable('resolut_portfolio_publications', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('client_id').unsigned().notNullable()
                .references('id').inTable('clients').onDelete('CASCADE');
            table.bigInteger('project_id').unsigned().nullable().index();
            table.bigInteger('agent_id').unsigned().nullable()
                .references('id').inTable('agents').onDelete('SET NULL');

            table.string('resolut_client_code', 64).nullable().index();
            table.string('resolut_portfolio_code', 64).nullable().index();
            table.string('resolut_portfolio_number', 64).nullable();

            table.json('contracts_json').nullable();
            table.json('quotes_submitted_json').nullable();
            table.json('skipped_json').nullable();
            table.json('upstream_response_json').nullable();

            table.timestamps(true, true);

            table.index(['client_id', 'created_at']);
        });
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    const hasPublicationsTable = await knex.schema.hasTable('resolut_portfolio_publications');
    if (hasPublicationsTable) {
        await knex.schema.dropTable('resolut_portfolio_publications');
    }

    const hasClientCode = await knex.schema.hasColumn('clients', 'resolut_client_code');
    const hasClientSyncedAt = await knex.schema.hasColumn('clients', 'resolut_client_synced_at');
    if (hasClientCode || hasClientSyncedAt) {
        await knex.schema.alterTable('clients', (table) => {
            if (hasClientCode) table.dropColumn('resolut_client_code');
            if (hasClientSyncedAt) table.dropColumn('resolut_client_synced_at');
        });
    }
};

