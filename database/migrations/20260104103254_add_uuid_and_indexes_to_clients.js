/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.table('clients', (table) => {
        // Опциональный UUID для внешних систем/партнеров
        table.string('external_uuid', 100).nullable().unique().index();

        // Индексы для быстрого поиска
        table.index(['last_name', 'first_name'], 'idx_client_fio');
        table.index(['phone'], 'idx_client_phone');
        table.index(['email'], 'idx_client_email');
    });
};

exports.down = function (knex) {
    return knex.schema.table('clients', (table) => {
        table.dropIndex(['last_name', 'first_name'], 'idx_client_fio');
        table.dropIndex(['phone'], 'idx_client_phone');
        table.dropIndex(['email'], 'idx_client_email');
        table.dropColumn('external_uuid');
    });
};
