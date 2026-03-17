const axios = require('axios');
const knex = require('../config/database');

class SmmService {
    constructor() {
        this.apiUrl = process.env.SMM_API_URL || 'http://localhost:4000/api';
        this.apiKey = process.env.INTERNAL_API_KEY || process.env.SMM_INTERNAL_API_KEY;
        if (!this.apiKey) {
            console.warn('CRITICAL WARNING: SMM_INTERNAL_API_KEY or INTERNAL_API_KEY environment variable is not set!');
        }
    }

    /**
     * Sync agent data with SMM AI via webhook
     * @param {number} agentId 
     * @returns {Promise<boolean>}
     */
    async syncAgent(agentId) {
        try {
            const agent = await knex('agents')
                .leftJoin('users', 'agents.id', 'users.agent_id')
                .select('agents.*', 'users.email')
                .where('agents.id', agentId)
                .first();

            if (!agent) {
                console.error(`[SmmService] Agent ${agentId} not found for sync`);
                return false;
            }

            const payload = {
                uuid: agent.uuid,
                email: agent.email,
                first_name: agent.first_name,
                last_name: agent.last_name,
                middle_name: agent.middle_name, // Added
                phone: agent.phone,
                telegram_channel: agent.telegram_channel,
                telegram_channel_id: agent.telegram_channel_id, // Added
                region: agent.region,
                city: agent.city,
                is_active: !!agent.is_active,
                timezone_offset_minutes: agent.timezone_offset_minutes || 180,
                about_text: agent.about_text, // Added
                position_title: agent.position_title // Added
            };

            const url = `${this.apiUrl}/internal/webhooks/agent-updated`;
            console.log(`[SmmService] Syncing agent ${agentId} to: ${url}`);
            console.log('[SmmService] Payload:', JSON.stringify(payload, null, 2));

            const response = await axios.post(url, payload, {
                headers: {
                    'x-internal-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[SmmService] Agent ${agentId} synced successfully. Response status: ${response.status}`);
            if (response.data) {
                console.log('[SmmService] Response data:', typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data);
            }
            return true;
        } catch (err) {
            console.error(`[SmmService] Failed to sync agent ${agentId}:`, err.message);
            if (err.response && err.response.data) {
                console.error('[SmmService] Error details:', JSON.stringify(err.response.data, null, 2));
            }
            return false;
        }
    }
}

module.exports = new SmmService();
