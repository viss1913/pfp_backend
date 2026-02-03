const knex = require('../config/database');

class AdminRepository {
    async getPfpCalculations(options = {}) {
        const { limit = null, page = 1, sort = 'clients.created_at', order = 'desc', search = '' } = options;
        const offset = limit ? (page - 1) * limit : 0;

        let query = knex('clients')
            .leftJoin('agents', 'clients.agent_id', 'agents.id')
            .select(
                'clients.id as pfp_id',
                'clients.first_name as client_first_name',
                'clients.last_name as client_last_name',
                'clients.middle_name as client_middle_name',
                'clients.crm_status',
                'clients.goals_summary',
                'clients.created_at',
                'agents.first_name as agent_first_name',
                'agents.last_name as agent_last_name',
                'agents.email as agent_email'
            );

        if (search) {
            query = query.where(function () {
                this.where('clients.first_name', 'like', `%${search}%`)
                    .orWhere('clients.last_name', 'like', `%${search}%`)
                    .orWhere('agents.first_name', 'like', `%${search}%`)
                    .orWhere('agents.last_name', 'like', `%${search}%`)
                    .orWhere('agents.email', 'like', `%${search}%`);
            });
        }

        // Count total for pagination
        const countQuery = query.clone().clearSelect().count('clients.id as total').first();
        const totalResult = await countQuery;
        const total = totalResult ? parseInt(totalResult.total) : 0;

        // Apply pagination and sort
        let finalQuery = query.orderBy(sort, order);
        if (limit) {
            finalQuery = finalQuery.limit(limit).offset(offset);
        }

        const rawData = await finalQuery;

        const data = rawData.map(row => {
            const clientFio = [row.client_last_name, row.client_first_name, row.client_middle_name]
                .filter(Boolean)
                .join(' ');

            const agentFio = [row.agent_last_name, row.agent_first_name]
                .filter(Boolean)
                .join(' ');

            let hasCalculation = false;
            if (row.goals_summary) {
                try {
                    const parsed = typeof row.goals_summary === 'string'
                        ? JSON.parse(row.goals_summary)
                        : row.goals_summary;

                    // Simple check if calculation exists in snapshot
                    hasCalculation = !!(parsed && (parsed.calculation || parsed.summary || (parsed.goals && parsed.goals.length > 0)));
                } catch (e) {
                    hasCalculation = false;
                }
            }

            return {
                pfp_id: row.pfp_id,
                client_fio: clientFio,
                agent_fio: agentFio || 'Не привязан',
                agent_email: row.agent_email || '-',
                status: row.crm_status,
                has_calculation: hasCalculation,
                created_at: row.created_at
            };
        });

        return {
            data,
            pagination: {
                total,
                page: limit ? parseInt(page) : 1,
                limit: limit ? parseInt(limit) : total,
                totalPages: limit ? Math.ceil(total / limit) : 1
            }
        };
    }
}

module.exports = new AdminRepository();
