/**
 * Allow the same email in different projects (multi-tenant).
 * Replaces global users.email unique with (email, project_id).
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function up(knex) {
    const dups = await knex('users')
        .select('email', 'project_id')
        .whereNotNull('project_id')
        .groupBy('email', 'project_id')
        .havingRaw('COUNT(*) > 1');

    if (dups.length > 0) {
        throw new Error(
            `Cannot migrate users_email_unique_per_project: duplicate (email, project_id) pairs found (${dups.length})`
        );
    }

    const indexes = await knex.raw('SHOW INDEX FROM users WHERE Column_name = ?', ['email']);
    const indexRows = indexes[0] || [];
    const emailOnlyUnique = indexRows.filter(
        (row) => row.Non_unique === 0 && row.Key_name !== 'PRIMARY' && row.Seq_in_index === 1
    );

    for (const row of emailOnlyUnique) {
        const keyName = row.Key_name;
        const cols = indexRows
            .filter((r) => r.Key_name === keyName)
            .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
            .map((r) => r.Column_name);
        if (cols.length === 1 && cols[0] === 'email') {
            await knex.raw(`ALTER TABLE users DROP INDEX \`${keyName}\``);
        }
    }

    const hasComposite = indexRows.some((r) => r.Key_name === 'users_email_project_unique');
    if (!hasComposite) {
        await knex.schema.alterTable('users', (table) => {
            table.unique(['email', 'project_id'], 'users_email_project_unique');
        });
    }
};

exports.down = async function down(knex) {
    await knex.schema.alterTable('users', (table) => {
        table.dropUnique(['email', 'project_id'], 'users_email_project_unique');
    });
    await knex.schema.alterTable('users', (table) => {
        table.unique(['email'], 'users_email_unique');
    });
};
