/**
 * Расширенный риск-профиль цели (5 уровней), в духе risk_profile_extended из анкеты.
 * Nullable для старых строк; расчёт по-прежнему опирается на risk_profile (3), пока портфель в режиме 3 срезов.
 */
exports.up = async function (knex) {
    const hasTable = await knex.schema.hasTable('goals');
    if (!hasTable) return;

    const hasCol = await knex.schema.hasColumn('goals', 'risk_profile_extended');
    if (hasCol) return;

    await knex.schema.alterTable('goals', (table) => {
        table.string('risk_profile_extended', 50).nullable();
    });
};

exports.down = async function (knex) {
    const hasTable = await knex.schema.hasTable('goals');
    if (!hasTable) return;

    const hasCol = await knex.schema.hasColumn('goals', 'risk_profile_extended');
    if (!hasCol) return;

    await knex.schema.alterTable('goals', (table) => {
        table.dropColumn('risk_profile_extended');
    });
};
