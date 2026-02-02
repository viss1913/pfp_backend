/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // 1. Insurance Products for Home Owners
        .createTable('insurance_home_owners_products', (table) => {
            table.increments('id').primary();
            table.string('name', 255).notNullable().unique();
            table.text('description').nullable();
            table.boolean('is_active').defaultTo(true);
            table.timestamps(true, true);
        })
        // 2. Tariffs and Coefficients
        .createTable('insurance_home_owners_tariffs', (table) => {
            table.increments('id').primary();
            table.integer('product_id').unsigned().notNullable()
                .references('id').inTable('insurance_home_owners_products').onDelete('CASCADE');

            table.string('parameter_name', 100).notNullable(); // e.g., 'object_type', 'wall_material'
            table.string('parameter_value', 100).notNullable(); // e.g., 'apartment', 'wood'
            table.decimal('coefficient', 10, 4).notNullable();
            table.string('label', 255).nullable(); // Label for UI

            // 'base' - initial rate, 'multiplier' - applied to base
            table.enum('coefficient_type', ['base', 'multiplier']).defaultTo('multiplier');

            table.timestamps(true, true);
        })
        // 3. Calculation History
        .createTable('insurance_home_owners_calculations', (table) => {
            table.bigIncrements('id').primary();

            table.bigInteger('agent_id').unsigned().notNullable()
                .references('id').inTable('agents').onDelete('CASCADE');
            table.bigInteger('client_id').unsigned().nullable()
                .references('id').inTable('clients').onDelete('SET NULL');

            table.integer('product_id').unsigned().notNullable()
                .references('id').inTable('insurance_home_owners_products').onDelete('CASCADE');

            table.json('input_params').notNullable(); // { object_type: 'wood', ... }
            table.json('result_data').notNullable();  // { total_premium: 1000, details: [...] }

            table.timestamp('created_at').defaultTo(knex.fn.now());
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('insurance_home_owners_calculations')
        .dropTableIfExists('insurance_home_owners_tariffs')
        .dropTableIfExists('insurance_home_owners_products');
};
