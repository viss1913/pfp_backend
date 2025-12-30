/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // 1. Reference Table: Progressive Tax Rates
    await knex.schema.createTable('tax_income_rates', (table) => {
        table.increments('id').primary();
        table.integer('tax_year').notNullable().defaultTo(2025);
        table.decimal('income_from', 18, 2).notNullable();
        table.decimal('income_to', 18, 2).notNullable(); // Use a very large number for Infinity
        table.decimal('rate', 5, 2).notNullable(); // e.g. 13.00
        table.integer('order_index').notNullable();
        table.string('description').nullable();
    });

    // 2. Configuration: Deduction Rules
    await knex.schema.createTable('tax_deduction_rules', (table) => {
        table.increments('id').primary();
        table.string('deduction_type').notNullable().defaultTo('PDS'); // PDS, IIS
        table.integer('year_from').notNullable();
        table.integer('year_to').notNullable(); // Can be far future
        table.decimal('base_limit', 18, 2).notNullable(); // e.g. 400000.00
        table.decimal('rate_min', 5, 4).nullable(); // 0.1300
        table.decimal('rate_max', 5, 4).nullable(); // 0.2200
        table.string('description').nullable();
    });

    // 3. Client Profile: Yearly Tax Snapshot
    await knex.schema.createTable('client_tax_profile', (table) => {
        table.increments('id').primary();
        // Assuming 'clients' table exists, otherwise logic differs. 
        // Safe to store client_id as integer/bigInteger without FK constraint if unsure about 'clients' table existence, 
        // but usually we want FK. Checking existing tables would be good, but strict mode is safer.
        // Based on previous files, 'clients' might not be the main table, 'users'? 
        // User request said: "client_id". I will use integer.
        table.integer('client_id').notNullable();
        table.integer('tax_year').notNullable();
        table.decimal('annual_income_brutto', 18, 2).defaultTo(0);
        table.decimal('annual_income_taxable', 18, 2).defaultTo(0);
        table.integer('ndfl_rate_id').unsigned().nullable(); // Reference to max bracket
        table.decimal('ndfl_rate_value', 5, 4).nullable(); // Effective or marginal rate (0.13)
        table.decimal('ndfl_amount_without_deductions', 18, 2).defaultTo(0);

        table.unique(['client_id', 'tax_year']);
    });

    // 4. Products: Specific Contracts (PDS, IIS)
    await knex.schema.createTable('pds_contracts', (table) => {
        table.increments('id').primary();
        table.integer('client_id').notNullable();
        table.string('product_type').notNullable(); // PDS, IIS
        table.integer('tax_year').notNullable();
        table.decimal('annual_contribution_plan', 18, 2).defaultTo(0);
        table.decimal('actual_contribution_year', 18, 2).defaultTo(0);
        table.decimal('tax_deduction_base', 18, 2).defaultTo(0);
        table.decimal('tax_deduction_amount', 18, 2).defaultTo(0);
    });

    // 5. Summary: Aggregated Results
    await knex.schema.createTable('tax_deductions_summary', (table) => {
        table.increments('id').primary();
        table.integer('client_id').notNullable();
        table.integer('tax_year').notNullable();
        table.decimal('pds_deduction_base_total', 18, 2).defaultTo(0);
        table.decimal('pds_deduction_amount_total', 18, 2).defaultTo(0);
        table.decimal('tax_due_without_deductions', 18, 2).defaultTo(0);
        table.decimal('tax_due_with_deductions', 18, 2).defaultTo(0);
        table.decimal('tax_refund_from_budget', 18, 2).defaultTo(0);

        table.unique(['client_id', 'tax_year']);
    });

    // --- SEED INITIAL DATA (2025) ---
    const initialRates = [
        { tax_year: 2025, income_from: 0, income_to: 2400000, rate: 13.00, order_index: 1, description: 'до 2.4 млн' },
        { tax_year: 2025, income_from: 2400001, income_to: 5000000, rate: 15.00, order_index: 2, description: '2.4 - 5 млн' },
        { tax_year: 2025, income_from: 5000001, income_to: 20000000, rate: 18.00, order_index: 3, description: '5 - 20 млн' },
        { tax_year: 2025, income_from: 20000001, income_to: 50000000, rate: 20.00, order_index: 4, description: '20 - 50 млн' },
        { tax_year: 2025, income_from: 50000001, income_to: 99999999999, rate: 22.00, order_index: 5, description: 'свыше 50 млн' },
    ];

    const initialRules = [
        {
            deduction_type: 'PDS',
            year_from: 2024,
            year_to: 2030,
            base_limit: 400000.00,
            rate_min: 0.13,
            rate_max: 0.22,
            description: 'Единый налоговый вычет (ПДС, ИИС-3, НПО)'
        }
    ];

    await knex('tax_income_rates').insert(initialRates);
    await knex('tax_deduction_rules').insert(initialRules);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('tax_deductions_summary');
    await knex.schema.dropTableIfExists('pds_contracts');
    await knex.schema.dropTableIfExists('client_tax_profile');
    await knex.schema.dropTableIfExists('tax_deduction_rules');
    await knex.schema.dropTableIfExists('tax_income_rates');
};
