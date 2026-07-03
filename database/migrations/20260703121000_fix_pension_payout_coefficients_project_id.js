/**
 * Immers: первая попытка миграции 20260703120000 могла создать таблицу без FK (integer vs bigint).
 */
exports.up = async function (knex) {
    const exists = await knex.schema.hasTable('pension_payout_coefficients');
    if (!exists) return;

    const [rows] = await knex.raw(
        "SHOW COLUMNS FROM pension_payout_coefficients WHERE Field = 'project_id'"
    );
    const column = rows && rows[0];
    if (column && String(column.Type).includes('bigint')) return;

    await knex.schema.dropTable('pension_payout_coefficients');
    await knex.schema.createTable('pension_payout_coefficients', (table) => {
        table.increments('id').primary();
        table.bigInteger('project_id').unsigned().nullable()
            .references('id').inTable('projects').onDelete('CASCADE');
        table.enum('gender', ['male', 'female']).notNullable();
        table.integer('age').unsigned().notNullable();
        table.decimal('coefficient', 8, 4).notNullable();
        table.timestamps(true, true);

        table.unique(['project_id', 'gender', 'age'], 'pension_payout_coeff_project_gender_age_uniq');
        table.index(['project_id', 'gender', 'age'], 'pension_payout_coeff_lookup_idx');
    });
};

exports.down = async function (knex) {
    const exists = await knex.schema.hasTable('pension_payout_coefficients');
    if (!exists) return;
    await knex.schema.dropTable('pension_payout_coefficients');
};
