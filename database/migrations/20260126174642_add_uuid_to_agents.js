const crypto = require('crypto');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('agents', (table) => {
        table.string('uuid', 36).unique().nullable().index();
    });

    // Populate existing agents with UUIDs
    const agents = await knex('agents').select('id');
    for (const agent of agents) {
        const uuid = crypto.randomUUID();
        await knex('agents').where('id', agent.id).update({ uuid });
    }

    // Optional: make it not nullable after population
    // await knex.schema.alterTable('agents', (table) => {
    //   table.string('uuid', 36).notNullable().alter();
    // });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.dropColumn('uuid');
    });
};
