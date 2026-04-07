/**
 * Рекомендованные стратегии Comon для витрины (полный снимок полей из API / ручного JSON).
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.createTable('comon_recommended_strategies', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('comon_strategy_id').unsigned().notNullable();
        table.json('payload').notNullable();
        table.integer('sort_order').unsigned().notNullable().defaultTo(0);
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamps(true, true);
        table.unique(['comon_strategy_id'], 'comon_rec_strat_comon_id_uidx');
        table.index(['is_active', 'sort_order']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('comon_recommended_strategies');
};
