/**
 * Убирает legacy unique(project_id) на ai_b2c_settings и stage_contexts,
 * оставляя unique(project_id, flow_key, stage_key).
 */

exports.up = async function up(knex) {
    const dropIndexIfExists = async (table, indexName) => {
        try {
            await knex.schema.alterTable(table, (t) => {
                t.dropIndex([], indexName);
            });
        } catch (_) {
            try {
                await knex.raw(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
            } catch (err2) {
                console.warn(`[migration] skip drop index ${table}.${indexName}:`, err2.message);
            }
        }
    };

    await dropIndexIfExists('ai_b2c_settings', 'ai_b2c_settings_project_id_unique');

    try {
        await knex.schema.alterTable('ai_b2c_stage_contexts', (table) => {
            table.dropUnique(['project_id', 'stage_key']);
        });
    } catch (_) {
        await dropIndexIfExists('ai_b2c_stage_contexts', 'ai_b2c_stage_contexts_project_id_stage_key_unique');
    }

    const hasCompositeStage = await knex.schema.hasTable('ai_b2c_stage_contexts');
    if (hasCompositeStage) {
        try {
            await knex.schema.alterTable('ai_b2c_stage_contexts', (table) => {
                table.unique(['project_id', 'flow_key', 'stage_key'], 'ai_b2c_stage_project_flow_key_uq');
            });
        } catch (_) {
            /* already exists */
        }
    }
};

exports.down = async function down() {
    /* no-op: не восстанавливаем legacy unique */
};
