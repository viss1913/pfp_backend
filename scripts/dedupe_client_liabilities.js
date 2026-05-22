#!/usr/bin/env node
'use strict';

/**
 * Убирает дубликаты кредитов в client_liabilities и пересчитывает liabilities_total / net_worth.
 *
 * Использование:
 *   node scripts/dedupe_client_liabilities.js <clientId>
 *   node scripts/dedupe_client_liabilities.js --all
 *
 * После правки перегенерируйте PDF отчёта (warmup / отчёт в ЛК).
 */

require('dotenv').config();

const clientService = require('../src/services/clientService');
const knex = require('../src/config/database');

async function dedupeOne(clientId) {
    const result = await clientService.repairClientLiabilitiesDuplicates(clientId);
    const client = await knex('clients').where({ id: clientId }).select('id', 'liabilities_total', 'net_worth').first();
    console.log(JSON.stringify({ clientId, ...result, liabilities_total: client?.liabilities_total, net_worth: client?.net_worth }));
}

async function dedupeAll() {
    const ids = await knex('client_liabilities').distinct('client_id').pluck('client_id');
    let repaired = 0;
    for (const clientId of ids) {
        const result = await clientService.repairClientLiabilitiesDuplicates(clientId);
        if (result.changed) {
            repaired += 1;
            console.log(`[dedupe] client ${clientId}: ${result.before} -> ${result.after} rows`);
        }
    }
    console.log(`[dedupe] done: ${repaired} clients updated of ${ids.length} with liabilities`);
}

async function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node scripts/dedupe_client_liabilities.js <clientId> | --all');
        process.exit(1);
    }
    try {
        if (arg === '--all') {
            await dedupeAll();
        } else {
            const clientId = Number(arg);
            if (!Number.isFinite(clientId) || clientId <= 0) {
                console.error('Invalid clientId');
                process.exit(1);
            }
            await dedupeOne(clientId);
        }
    } catch (err) {
        console.error('[dedupe] failed:', err?.message || err);
        process.exit(1);
    } finally {
        await knex.destroy();
    }
}

main();
