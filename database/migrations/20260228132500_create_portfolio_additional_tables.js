/**
 * Migration to create missing portfolio tables properly instead of ad-hoc scripts.
 */
exports.up = async function (knex) {
    const hasClassLinks = await knex.schema.hasTable('portfolio_class_links');
    if (!hasClassLinks) {
        await knex.schema.createTable('portfolio_class_links', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_id').unsigned().notNullable()
                .references('id').inTable('portfolios').onDelete('CASCADE');
            table.integer('class_id').unsigned().notNullable()
                .references('id').inTable('portfolio_classes').onDelete('CASCADE');
        });
    }

    const hasRiskProfiles = await knex.schema.hasTable('portfolio_risk_profiles');
    if (!hasRiskProfiles) {
        await knex.schema.createTable('portfolio_risk_profiles', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_id').unsigned().notNullable()
                .references('id').inTable('portfolios').onDelete('CASCADE');
            table.enu('profile_type', ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).notNullable();
            table.decimal('potential_yield_percent', 5, 2).nullable();
        });
    }

    const hasInstruments = await knex.schema.hasTable('portfolio_instruments');
    if (!hasInstruments) {
        await knex.schema.createTable('portfolio_instruments', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_risk_profile_id').unsigned().notNullable()
                .references('id').inTable('portfolio_risk_profiles').onDelete('CASCADE');
            table.bigInteger('product_id').unsigned().notNullable()
                .references('id').inTable('products').onDelete('RESTRICT');
            table.enu('bucket_type', ['INITIAL_CAPITAL', 'TOP_UP']).nullable();
            table.decimal('share_percent', 5, 2).notNullable();
            table.integer('order_index').nullable();
        });
    }
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('portfolio_instruments');
    await knex.schema.dropTableIfExists('portfolio_risk_profiles');
    await knex.schema.dropTableIfExists('portfolio_class_links');
};
