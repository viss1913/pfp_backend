/**
 * Связь чата конструктора с записью клиента ПФП (CRM + отчёт PDF).
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('constructor_clients', (table) => {
        table.bigInteger('pfp_client_id').unsigned().nullable()
            .references('id').inTable('clients').onDelete('SET NULL');
        table.index(['pfp_client_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('constructor_clients', (table) => {
        table.dropForeign(['pfp_client_id']);
        table.dropColumn('pfp_client_id');
    });
};
