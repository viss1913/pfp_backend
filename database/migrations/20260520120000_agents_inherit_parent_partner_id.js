/**
 * Allow subagents to use curator Finam ID for UTM without copying into partner_agent_id (unique per project).
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('agents', 'inherit_parent_partner_agent_id');
    if (hasColumn) return;

    await knex.schema.alterTable('agents', (table) => {
        table
            .boolean('inherit_parent_partner_agent_id')
            .notNullable()
            .defaultTo(false)
            .comment('Use parent partner_agent_id for tracking when own ID is empty');
    });
};

exports.down = async function (knex) {
    const hasColumn = await knex.schema.hasColumn('agents', 'inherit_parent_partner_agent_id');
    if (!hasColumn) return;

    await knex.schema.alterTable('agents', (table) => {
        table.dropColumn('inherit_parent_partner_agent_id');
    });
};
