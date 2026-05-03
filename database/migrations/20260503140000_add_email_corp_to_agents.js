/**
 * Корпоративная локальная часть почты (без @domain) для From в Resend при шаблоне {agent}@domain.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.string('email_corp', 255).nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.dropColumn('email_corp');
    });
};
