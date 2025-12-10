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

        // 3.4. Portfolio Classes (справочник)
        .createTable('portfolio_classes', (table) => {
            table.increments('id').primary(); // INT PK
            table.string('code', 50).unique().notNullable();
            table.string('name', 255).nullable();
        })

        // 3.5. Portfolios
        .createTable('portfolios', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('agent_id').unsigned().nullable()
                .references('id').inTable('agents').onDelete('CASCADE'); // NULL = standard portfolio
            table.string('name', 255).notNullable();
            table.string('currency', 10).notNullable().defaultTo('RUB');
            
            // Параметры портфеля
            table.decimal('amount_from', 18, 2).notNullable();
            table.decimal('amount_to', 18, 2).notNullable();
            table.integer('term_from_months').notNullable();
            table.integer('term_to_months').notNullable();
            table.integer('age_from').nullable();
            table.integer('age_to').nullable();
            table.string('investor_type', 100).nullable();
            table.string('gender', 10).nullable();
            
            // JSON поля
            table.json('classes').nullable(); // Массив ID классов портфеля
            table.json('risk_profiles').nullable(); // Массив риск-профилей с инструментами
            
            // Метаданные (FK на users будет добавлен в миграции после создания таблицы users)
            table.bigInteger('created_by').unsigned().nullable();
            table.bigInteger('updated_by').unsigned().nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.boolean('is_default').notNullable().defaultTo(false);
            table.timestamps(true, true);

            table.index(['agent_id']);
            table.index(['is_active']);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('portfolios')
        .dropTableIfExists('portfolio_classes')
        .dropTableIfExists('products')
        .dropTableIfExists('agents');
};
