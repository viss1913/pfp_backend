const axios = require('axios');
const knex = require('../config/database');

class SmmService {
    constructor() {
        this.apiUrl = process.env.SMM_API_URL || 'http://localhost:4000/api';
        this.apiKey = process.env.SMM_INTERNAL_API_KEY || 'smm-secret-key';
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
                external_agent_id: agent.id,
                uuid: agent.uuid, // Pass our universal UUID
                first_name: agent.first_name,
                last_name: agent.last_name,
                middle_name: agent.middle_name,
                phone: agent.phone,
                email: agent.email,
                website_url: agent.website_url,
                telegram_bot: agent.telegram_bot,
                telegram_channel: agent.telegram_channel,
                telegram_channel_id: agent.telegram_channel_id,
                region: agent.region,
                city: agent.city,
                timezone: agent.timezone,
                office_address: agent.office_address,
                position_title: agent.position_title,
                specialization: agent.specialization,
                consultation_price: agent.consultation_price,
                currency: agent.currency,
                target_customer_segment: agent.target_customer_segment,
                about_text: agent.about_text,
                experience_years: agent.experience_years,
                is_active: !!agent.is_active,
                date_joined: agent.date_joined,
                updated_at: agent.updated_at
            };

            console.log(`[SmmService] Syncing agent ${agentId} to SMM...`);

            await axios.post(`${this.apiUrl}/internal/webhooks/agent-updated`, payload, {
                headers: {
                    'X-Internal-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[SmmService] Agent ${agentId} synced successfully`);
            return true;
        } catch (err) {
            console.error(`[SmmService] Failed to sync agent ${agentId}:`, err.message);
            // We don't throw here to avoid breaking the main process if SMM is down
            return false;
        }
    }
}

module.exports = new SmmService();
