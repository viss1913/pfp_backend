/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        .createTable('product_types', (table) => {
            table.increments('id').primary();
            table.string('code', 50).unique().notNullable().comment('Код типа продукта (PDS, IIS, ISZH, etc.)');
            table.string('name', 255).notNullable().comment('Название типа продукта');
            table.text('description').nullable().comment('Описание типа продукта');
            table.boolean('is_active').notNullable().defaultTo(true).comment('Активен ли тип');
            table.integer('order_index').defaultTo(0).comment('Порядок сортировки');
            table.timestamps(true, true);
            
            table.index(['is_active']);
            table.index(['order_index']);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('product_types');
};

