/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('goals', 'monthly_replenishment');
    if (hasColumn) return;

    await knex.schema.alterTable('goals', (table) => {
        table.decimal('monthly_replenishment', 18, 2).nullable().defaultTo(0).after('initial_capital');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('goals', 'monthly_replenishment');
    if (!hasColumn) return;

    await knex.schema.alterTable('goals', (table) => {
        table.dropColumn('monthly_replenishment');
    });
};
