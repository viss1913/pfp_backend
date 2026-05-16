/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('email_verifications', (table) => {
        table
            .string('purpose', 32)
            .notNullable()
            .defaultTo('client_register')
            .comment('client_register | agent_register');
        table.json('payload').nullable();
        table.index(['email', 'purpose', 'verified']);
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable('email_verifications', (table) => {
        table.dropIndex(['email', 'purpose', 'verified']);
        table.dropColumn('payload');
        table.dropColumn('purpose');
    });
};
