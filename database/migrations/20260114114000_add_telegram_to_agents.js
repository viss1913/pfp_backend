/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.string('telegram_bot', 255).nullable().comment('Username или токен телеграм-бота агента');
        table.string('telegram_channel', 255).nullable().comment('Ссылка или username телеграм-канала агента');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.dropColumns(['telegram_bot', 'telegram_channel']);
    });
};
