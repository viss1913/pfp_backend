/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('clients', (table) => {
        // CRM Statuses defined by user
        table.enu('crm_status', ['THINKING', 'BOUGHT', 'REFUSED', 'RENEWAL'])
            .defaultTo('THINKING')
            .comment('Current lifecycle stage: THINKING (daily reminder), BOUGHT (closed), REFUSED (lost), RENEWAL (future reminder)');

        table.timestamp('crm_status_date').defaultTo(knex.fn.now());

        table.timestamp('next_action_date').nullable().comment('Date when AI should trigger a reminder/briefing');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.table('clients', (table) => {
        table.dropColumn('crm_status');
        table.dropColumn('crm_status_date');
        table.dropColumn('next_action_date');
    });
};
