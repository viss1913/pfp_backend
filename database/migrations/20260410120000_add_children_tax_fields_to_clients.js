/**
 * Вычет на детей в расчётах first-run: колонки под флаги и JSON массива детей.
 * Код (Joi, калькуляторы) уже был — без этих полей INSERT на прод падал.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('clients', (table) => {
        table
            .boolean('enable_children_tax_deduction')
            .notNullable()
            .defaultTo(false)
            .comment('Учитывать стандартный вычет на детей в расчётах');
        table
            .json('tax_children')
            .nullable()
            .comment('Дети для расчёта вычета (JSON array)');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('clients', (table) => {
        table.dropColumn('enable_children_tax_deduction');
        table.dropColumn('tax_children');
    });
};
