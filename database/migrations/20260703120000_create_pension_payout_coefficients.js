/**
 * Таблица коэффициентов выплат по пенсии (пол × возраст на пенсии).
 * coefficient — годовая доходность % (как yield_percent в passive_income_yield).
 */
exports.up = function (knex) {
    return knex.schema.createTable('pension_payout_coefficients', (table) => {
        table.increments('id').primary();
        table.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
        table.enum('gender', ['male', 'female']).notNullable();
        table.integer('age').unsigned().notNullable();
        table.decimal('coefficient', 8, 4).notNullable();
        table.timestamps(true, true);

        table.unique(['project_id', 'gender', 'age'], 'pension_payout_coeff_project_gender_age_uniq');
        table.index(['project_id', 'gender', 'age'], 'pension_payout_coeff_lookup_idx');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('pension_payout_coefficients');
};
