/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // 3.1. Agents
        .createTable('agents', (table) => {
            table.bigIncrements('id').primary();
            // External directory, just ID is required for FKs, but we can add timestamps
            table.timestamps(true, true);
        })

        // 3.2. Products
        .createTable('products', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('agent_id').unsigned().nullable()
                .references('id').inTable('agents').onDelete('CASCADE'); // NULL = general product
            table.string('name', 255).notNullable();
            table.string('product_type', 50).notNullable(); // IIS, ISZH, NSZH, etc.
            table.string('currency', 10).notNullable().defaultTo('RUB');
            table.json('lines').nullable(); // Линии доходности: массив объектов с min_term_months, max_term_months, min_amount, max_amount, yield_percent
            table.boolean('is_active').notNullable().defaultTo(true);
            table.boolean('is_default').notNullable().defaultTo(false);
            table.timestamps(true, true);

            table.index(['agent_id']);
            table.index(['product_type']);
            table.index(['is_active']);
        })

        // 3.4. Portfolios
        .createTable('portfolios', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('agent_id').unsigned().nullable()
                .references('id').inTable('agents').onDelete('CASCADE'); // NULL = standard portfolio
            table.string('name', 255).notNullable();
            table.string('currency', 10).notNullable().defaultTo('RUB');
            table.decimal('amount_from', 18, 2).notNullable();
            table.decimal('amount_to', 18, 2).notNullable();
            table.integer('term_from_months').notNullable();
            table.integer('term_to_months').notNullable();
            table.integer('age_from').nullable();
            table.integer('age_to').nullable();
            table.string('investor_type', 100).nullable();
            table.string('gender', 10).nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.boolean('is_default').notNullable().defaultTo(false);
            table.timestamps(true, true);
        })

        // 3.5. Portfolio Classes
        .createTable('portfolio_classes', (table) => {
            table.increments('id').primary(); // INT PK
            table.string('code', 50).unique().notNullable();
            table.string('name', 255).nullable();
        })

        // Link: Portfolio <-> Class
        .createTable('portfolio_class_links', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_id').unsigned().notNullable()
                .references('id').inTable('portfolios').onDelete('CASCADE');
            table.integer('class_id').unsigned().notNullable()
                .references('id').inTable('portfolio_classes').onDelete('CASCADE');
        })

        // 3.6. Portfolio Risk Profiles
        .createTable('portfolio_risk_profiles', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_id').unsigned().notNullable()
                .references('id').inTable('portfolios').onDelete('CASCADE');
            table.enu('profile_type', ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).notNullable();
            table.decimal('potential_yield_percent', 5, 2).nullable();
        })

        // 3.7. Portfolio Instruments
        .createTable('portfolio_instruments', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_risk_profile_id').unsigned().notNullable()
                .references('id').inTable('portfolio_risk_profiles').onDelete('CASCADE');
            table.bigInteger('product_id').unsigned().notNullable()
                .references('id').inTable('products').onDelete('RESTRICT'); // Don't delete product if used in instrument? Or CASCADE? Usually restrict or set null. Let's keep RESTRICT to be safe or CASCADE if we want clean wipe. Prompt doesn't specify. I'll use CASCADE for dev ease, but RESTRICT is safer. I'll use CASCADE to avoid manual cleanup issues during dev.
            table.enu('bucket_type', ['INITIAL_CAPITAL', 'TOP_UP']).nullable();
            table.decimal('share_percent', 5, 2).notNullable();
            table.integer('order_index').nullable();
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('portfolio_instruments')
        .dropTableIfExists('portfolio_risk_profiles')
        .dropTableIfExists('portfolio_class_links')
        .dropTableIfExists('portfolio_classes')
        .dropTableIfExists('portfolios')
        .dropTableIfExists('products')
        .dropTableIfExists('agents');
};
