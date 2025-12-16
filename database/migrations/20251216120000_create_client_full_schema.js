/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // 1. Clients Table (Карточка клиента)
        .createTable('clients', (table) => {
            table.bigIncrements('id').primary();

            // Links
            table.bigInteger('agent_id').unsigned().nullable()
                .references('id').inTable('agents').onDelete('CASCADE');
            table.bigInteger('user_id').unsigned().nullable()
                .references('id').inTable('users').onDelete('SET NULL');

            // 1.1 Personal Data
            table.string('first_name', 100).notNullable();
            table.string('last_name', 100).notNullable();
            table.string('middle_name', 100).nullable();
            table.date('birth_date').nullable();
            table.string('gender', 10).nullable(); // 'male', 'female'
            table.string('phone', 50).nullable();
            table.string('email', 255).nullable();
            table.text('notes').nullable();

            // 1.2 Social Status
            table.string('marital_status', 50).nullable(); // 'single', 'married', etc.
            table.integer('dependents_count').defaultTo(0);

            // 1.3 Work & Tax Status
            // 'EMPLOYED', 'SELF_EMPLOYED', 'IP', 'BUSINESS_OWNER', 'UNEMPLOYED'
            table.string('employment_type', 50).defaultTo('EMPLOYED');
            // Specific tax regime if IP/Self-employed
            table.string('tax_mode', 50).nullable();
            // Base tax rate %
            table.decimal('tax_rate', 5, 2).nullable();

            // 1.4 Financial Profile Aggregates (Base for Math)
            table.decimal('avg_monthly_income', 18, 2).defaultTo(0);

            // Pension Specifics
            table.decimal('ipk_current', 10, 2).defaultTo(0); // Накопленные баллы
            table.integer('experience_years').defaultTo(0); // Стаж

            // 1.5 Aggregates (Cached for filtering/analysis)
            table.decimal('assets_total', 18, 2).defaultTo(0);
            table.decimal('liabilities_total', 18, 2).defaultTo(0);
            table.decimal('net_worth', 18, 2).defaultTo(0);

            // 1.6 Plan Summary (Snapshot)
            // JSON Array of goal summaries: [{ type, name, target, gap, recommended_contrib, pension_data... }, ...]
            table.jsonb('goals_summary').nullable();

            table.timestamps(true, true);
        })

        // 2. Client Assets (Resources / Point A)
        .createTable('client_assets', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('client_id').unsigned().notNullable()
                .references('id').inTable('clients').onDelete('CASCADE');

            // 'DEPOSIT', 'CASH', 'BROKERAGE', 'IIS', 'PDS', 'NSJ', 'REAL_ESTATE', 'CRYPTO', 'OTHER'
            table.string('type', 50).notNullable();
            table.string('name', 255).notNullable();

            table.decimal('current_value', 18, 2).defaultTo(0); // Оценка/Остаток
            table.string('currency', 10).defaultTo('RUB');

            // Extra params
            table.decimal('yield_percent', 5, 2).nullable(); // Ожидаемая доходность / Ставка
            table.date('start_date').nullable();
            table.date('end_date').nullable(); // Срок окончания
            table.string('risk_level', 50).nullable(); // 'conservative', 'moderate', 'aggressive'

            table.timestamps(true, true);
        })

        // 3. Client Liabilities (Debts / Point A)
        .createTable('client_liabilities', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('client_id').unsigned().notNullable()
                .references('id').inTable('clients').onDelete('CASCADE');

            // 'MORTGAGE', 'CONSUMER_LOAN', 'CREDIT_CARD', 'AUTO_LOAN', 'OTHER'
            table.string('type', 50).notNullable();
            table.string('name', 255).notNullable();

            table.decimal('remaining_amount', 18, 2).defaultTo(0); // Остаток долга
            table.decimal('monthly_payment', 18, 2).defaultTo(0); // Платёж в месяц (для Cash Flow)
            table.decimal('interest_rate', 5, 2).nullable(); // % ставка
            table.string('currency', 10).defaultTo('RUB');

            table.date('end_date').nullable(); // Дата погашения

            table.timestamps(true, true);
        })

        // 4. Client Expenses (Budget Flow)
        .createTable('client_expenses', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('client_id').unsigned().notNullable()
                .references('id').inTable('clients').onDelete('CASCADE');

            // 'LIVING', 'HOUSING', 'CHILDREN', 'LOANS', 'LEISURE', 'OTHER'
            table.string('category', 50).notNullable();
            table.string('name', 255).nullable();

            table.decimal('amount', 18, 2).defaultTo(0);
            table.string('currency', 10).defaultTo('RUB');

            table.timestamps(true, true);
        })

        // 5. Goals (Detailed Plan)
        .createTable('goals', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('client_id').unsigned().notNullable()
                .references('id').inTable('clients').onDelete('CASCADE');

            // Link to portfolio_classes (PENSION, EDUCATION, etc.)
            table.integer('goal_type_id').unsigned().notNullable();

            table.string('name', 255).notNullable();

            // Financial Targets
            table.decimal('target_amount', 18, 2).nullable(); // Целевая сумма капитала
            table.decimal('desired_monthly_income', 18, 2).nullable(); // Желаемый доход

            table.integer('term_months').nullable(); // Срок в месяцах
            table.date('end_date').nullable(); // Расчетная дата окончания

            table.decimal('initial_capital', 18, 2).defaultTo(0); // Выделенный стартовый капитал

            // Calculation Params
            table.decimal('inflation_rate', 5, 2).nullable(); // Персональная инфляция
            table.string('risk_profile', 50).nullable(); // 'CONSERVATIVE', etc.

            // Flexible params for specific goal types (Pension age, NSJ schedules, etc.)
            table.jsonb('params').nullable();

            table.timestamps(true, true);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('goals')
        .dropTableIfExists('client_expenses')
        .dropTableIfExists('client_liabilities')
        .dropTableIfExists('client_assets')
        .dropTableIfExists('clients');
};
