require('dotenv').config({ override: true });
const knex = require('../src/config/database');
const bcrypt = require('bcryptjs');

const KEY_TO_TEST = 'pk_live_86e37c419658eecc_469ae342d5e2736cfcc6a0138727e8ebd22da7895a084b7bd7b7ecd51f487127';

async function debugKey() {
    console.log('--- Debugging Key ---');
    console.log('Key:', KEY_TO_TEST);

    try {
        // 1. Extract prefix manually
        const parts = KEY_TO_TEST.split('_');
        const publicPart = parts[2];
        const dbPrefix = 'pk_live_' + publicPart;
        console.log('Derived Prefix:', dbPrefix);

        // 2. Lookup DB
        const record = await knex('api_keys').where('prefix', dbPrefix).first();

        if (!record) {
            console.error('❌ No record found in DB!');
            const allKeys = await knex('api_keys').select('prefix', 'id');
            console.log('Available prefixes:', allKeys);
            return;
        }

        console.log('✅ Record found. ID:', record.id);
        console.log('Stored Hash:', record.key_hash);

        // 3. Compare Hash
        console.log('Comparing...');
        const match = await bcrypt.compare(KEY_TO_TEST, record.key_hash);

        if (match) {
            console.log('✅ Hash MATCHES!');
        } else {
            console.error('❌ Hash DOES NOT MATCH!');
        }

    } catch (e) {
        console.error(e);
    } finally {
        knex.destroy();
    }
}

debugKey();
