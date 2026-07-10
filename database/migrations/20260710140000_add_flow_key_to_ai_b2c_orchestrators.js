/**
 * Несколько B2C-оркестраторов (flows) на один проект.
 * flow_key = 'default' для обратной совместимости.
 */

const FLOW_KEY = 'flow_key';

async function addFlowKeyColumn(knex, tableName, withProjectIndex = true) {
    const hasColumn = await knex.schema.hasColumn(tableName, FLOW_KEY);
    if (hasColumn) return;

    await knex.schema.alterTable(tableName, (table) => {
        table.string(FLOW_KEY, 64).notNullable().defaultTo('default');
        if (withProjectIndex) {
            table.index(['project_id', FLOW_KEY], `${tableName}_project_flow_idx`);
        }
    });
}

exports.up = async function up(knex) {
    await addFlowKeyColumn(knex, 'ai_b2c_brain_contexts');
    await addFlowKeyColumn(knex, 'ai_b2c_stage_contexts');

    const hasChatFlowKey = await knex.schema.hasColumn('ai_b2c_chat_messages', FLOW_KEY);
    if (!hasChatFlowKey) {
        await knex.schema.alterTable('ai_b2c_chat_messages', (table) => {
            table.string(FLOW_KEY, 64).notNullable().defaultTo('default');
            table.index(['client_id', FLOW_KEY], 'ai_b2c_chat_messages_client_flow_idx');
        });
    }

    const hasSettingsFlowKey = await knex.schema.hasColumn('ai_b2c_settings', FLOW_KEY);
    if (!hasSettingsFlowKey) {
        await knex.schema.alterTable('ai_b2c_settings', (table) => {
            table.string(FLOW_KEY, 64).notNullable().defaultTo('default');
        });
    }

    const hasFlowsTable = await knex.schema.hasTable('ai_b2c_flows');
    if (!hasFlowsTable) {
        await knex.schema.createTable('ai_b2c_flows', (table) => {
            table.increments('id').primary();
            table.bigInteger('project_id').unsigned().notNullable();
            table.string('flow_key', 64).notNullable();
            table.string('title', 255).notNullable();
            table.text('description').nullable();
            table.boolean('is_active').defaultTo(true);
            table.timestamps(true, true);

            table.unique(['project_id', 'flow_key']);
            table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        });
    }

    const projectsWithStages = await knex('ai_b2c_stage_contexts')
        .whereNotNull('project_id')
        .groupBy('project_id')
        .pluck('project_id');

    for (const projectId of projectsWithStages) {
        const exists = await knex('ai_b2c_flows')
            .where({ project_id: projectId, flow_key: 'default' })
            .first();
        if (!exists) {
            await knex('ai_b2c_flows').insert({
                project_id: projectId,
                flow_key: 'default',
                title: 'Основной сценарий',
                description: 'Создан автоматически при миграции',
                is_active: true,
            });
        }
    }

    try {
        await knex.schema.alterTable('ai_b2c_stage_contexts', (table) => {
            table.dropUnique(['project_id', 'stage_key']);
        });
    } catch (_) {
        /* unique мог называться иначе — не блокируем миграцию */
    }

    try {
        await knex.schema.alterTable('ai_b2c_stage_contexts', (table) => {
            table.unique(['project_id', 'flow_key', 'stage_key'], 'ai_b2c_stage_project_flow_key_uq');
        });
    } catch (_) {
        /* уже есть */
    }

    try {
        await knex.schema.alterTable('ai_b2c_settings', (table) => {
            table.dropUnique(['project_id']);
        });
    } catch (_) {
        /* ignore */
    }

    try {
        await knex.schema.alterTable('ai_b2c_settings', (table) => {
            table.unique(['project_id', 'flow_key'], 'ai_b2c_settings_project_flow_uq');
        });
    } catch (_) {
        /* ignore */
    }
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('ai_b2c_flows');

    for (const tableName of ['ai_b2c_brain_contexts', 'ai_b2c_stage_contexts', 'ai_b2c_chat_messages', 'ai_b2c_settings']) {
        const hasColumn = await knex.schema.hasColumn(tableName, FLOW_KEY);
        if (!hasColumn) continue;
        await knex.schema.alterTable(tableName, (table) => {
            table.dropColumn(FLOW_KEY);
        });
    }
};
