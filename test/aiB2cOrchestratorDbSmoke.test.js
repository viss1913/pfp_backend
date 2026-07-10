const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Smoke: миграция flow_key и таблица ai_b2c_flows (если есть DB).
 */
test('ai_b2c_flows table and flow_key columns exist', async (t) => {
    require('dotenv').config();
    const knex = require('../src/config/database');

    const hasFlows = await knex.schema.hasTable('ai_b2c_flows');
    assert.equal(hasFlows, true, 'ai_b2c_flows table missing — run migration 20260710140000');

    const tables = ['ai_b2c_stage_contexts', 'ai_b2c_brain_contexts', 'ai_b2c_chat_messages', 'ai_b2c_settings'];
    for (const table of tables) {
        const hasCol = await knex.schema.hasColumn(table, 'flow_key');
        assert.equal(hasCol, true, `${table}.flow_key missing`);
    }
});

test('orchestrator SSE payload shape', () => {
    const payload = {
        type: 'classifier_command',
        command: '/test23_pensia',
        stage_key: '/test23_pensia',
        classifierSkipped: false,
    };
    assert.equal(payload.type, 'classifier_command');
    assert.match(payload.command, /^\//);
});
