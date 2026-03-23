/**
 * Стратегии Comon в ЛК агента (карточка + привязка к id на comon.ru для графика /api/v2/strategies/{id}/profit).
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.createTable('agent_comon_strategies', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('agent_id').unsigned().notNullable()
            .references('id').inTable('agents').onDelete('CASCADE');
        table.string('comon_strategy_id', 32).notNullable();
        table.string('comon_url', 512).nullable();
        table.string('name', 255).notNullable();
        table.decimal('min_contribution', 18, 2).nullable();
        table.string('risk_profile', 32).notNullable();
        table.text('description').nullable();
        table.json('portfolio').notNullable();
        table.timestamps(true, true);
        table.unique(['agent_id', 'comon_strategy_id'], 'agent_comon_strategies_agent_comon_uidx');
        table.index(['agent_id']);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('agent_comon_strategies');
};
