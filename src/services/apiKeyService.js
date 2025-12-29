const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const knex = require('../config/database');

const SALT_ROUNDS = 10;
const KEY_PREFIX = 'pk_live_';

class ApiKeyService {
    /**
     * Generate a new API Key for an Agent
     * @param {number} agentId 
     * @param {string} name 
     * @returns {Promise<Object>} { key, id, prefix }
     */
    async generateKey(agentId, name) {
        // Format: pk_live_<public_id_8_hex>_<secret_32_hex>
        const publicId = crypto.randomBytes(8).toString('hex'); // 16 chars
        const secret = crypto.randomBytes(32).toString('hex'); // 64 chars

        const key = `${KEY_PREFIX}${publicId}_${secret}`;
        const dbPrefix = `${KEY_PREFIX}${publicId}`; // pk_live_abc123...

        // Hash the FULL key
        const hash = await bcrypt.hash(key, SALT_ROUNDS);

        // Store
        const [id] = await knex('api_keys').insert({
            agent_id: agentId,
            prefix: dbPrefix, // Unique index for lookup
            key_hash: hash,
            name: name,
            is_active: true
        }).returning('id');

        return {
            id: typeof id === 'object' ? id.id : id,
            key,
            prefix: dbPrefix
        };
    }

    /**
     * Validate an API Key from request
     * @param {string} apiKey 
     * @returns {Promise<Object|null>} user/agent context or null
     */
    async validateKey(apiKey) {
        if (!apiKey || !apiKey.startsWith(KEY_PREFIX)) return null;

        // Key: pk_live_PUBLIC_SECRET
        // Split by '_' -> ['pk', 'live', 'publicHex', 'secretHex']
        const parts = apiKey.split('_');
        if (parts.length < 4) return null;

        // Extract public part (index 2)
        const publicPart = parts[2];
        const dbPrefix = `${KEY_PREFIX}${publicPart}`;

        const keyRecord = await knex('api_keys')
            .where('prefix', dbPrefix)
            .where('is_active', true)
            .first();

        if (!keyRecord) return null;

        // Verify full key against hash
        const match = await bcrypt.compare(apiKey, keyRecord.key_hash);

        if (!match) return null;

        // Updates last_used (fire and forget)
        knex('api_keys').where('id', keyRecord.id).update({ last_used_at: new Date() }).catch(() => { });

        const agent = await knex('agents').where('id', keyRecord.agent_id).first();
        if (!agent) return null;

        return {
            id: agent.id,
            agentId: agent.id,
            role: 'agent',
            isApiKey: true,
            keyName: keyRecord.name
        };
    }
}

module.exports = new ApiKeyService();
