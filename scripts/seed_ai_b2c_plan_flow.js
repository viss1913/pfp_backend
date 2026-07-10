#!/usr/bin/env node
/**
 * Создаёт flow `plan` для B2C-оркестратора (клон из default).
 *
 * Usage:
 *   node scripts/seed_ai_b2c_plan_flow.js [projectId]
 *
 * Env: те же DB-переменные, что у knex (.env).
 */

require('dotenv').config();
const knex = require('../src/config/database');
const aiB2cService = require('../src/services/aiB2cService');

const PROJECT_ID = Number(process.argv[2] || process.env.AI_B2C_PLAN_FLOW_PROJECT_ID || 2);
const FLOW_KEY = 'plan';

async function main() {
    if (!PROJECT_ID) {
        console.error('projectId required');
        process.exit(1);
    }

    const existing = await knex('ai_b2c_flows')
        .where({ project_id: PROJECT_ID, flow_key: FLOW_KEY })
        .first();

    if (existing) {
        console.log(`[seed] flow "${FLOW_KEY}" already exists for project ${PROJECT_ID} (id=${existing.id})`);
        process.exit(0);
    }

    const created = await aiB2cService.createFlow(PROJECT_ID, {
        flow_key: FLOW_KEY,
        title: 'Сценарий /plan',
        description: 'B2C-оркестратор для маршрута /plan',
        clone_from: 'default',
    });

    console.log('[seed] created flow:', created);

    const stageCount = await knex('ai_b2c_stage_contexts')
        .where({ project_id: PROJECT_ID, flow_key: FLOW_KEY })
        .count({ c: '*' })
        .first();

    console.log('[seed] stages in plan flow:', stageCount?.c ?? 0);
    process.exit(0);
}

main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
});
