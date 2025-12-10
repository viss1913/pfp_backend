const db = require('../config/database');

class PortfolioRepository {
    async findAll({ agentId, filters = {}, includeDefaults = true }) {
        const query = db('portfolios').select('*');

        query.where((builder) => {
            builder.where('agent_id', agentId);
            if (includeDefaults) {
                builder.orWhereNull('agent_id');
            }
        });

        if (filters.amount_from) query.where('amount_from', '>=', filters.amount_from);
        // ... Implement other filters as needed

        const rows = await query;

        // Parse JSON fields
        return rows.map(row => ({
            ...row,
            classes: row.classes ? (typeof row.classes === 'string' ? JSON.parse(row.classes) : row.classes) : [],
            risk_profiles: row.risk_profiles ? (typeof row.risk_profiles === 'string' ? JSON.parse(row.risk_profiles) : row.risk_profiles) : []
        }));
    }

    async findById(id) {
        const portfolio = await db('portfolios').where({ id }).first();
        if (!portfolio) return null;

        // Parse JSON fields
        portfolio.classes = portfolio.classes ? (typeof portfolio.classes === 'string' ? JSON.parse(portfolio.classes) : portfolio.classes) : [];
        portfolio.risk_profiles = portfolio.risk_profiles ? (typeof portfolio.risk_profiles === 'string' ? JSON.parse(portfolio.risk_profiles) : portfolio.risk_profiles) : [];

        return portfolio;
    }

    async create(portfolioData, classIds, riskProfilesData) {
        const dataToInsert = {
            ...portfolioData,
            classes: classIds && classIds.length > 0 ? JSON.stringify(classIds) : null,
            risk_profiles: riskProfilesData && riskProfilesData.length > 0 ? JSON.stringify(riskProfilesData) : null
        };

        const [id] = await db('portfolios').insert(dataToInsert);
        return id;
    }

    async update(id, portfolioData, classIds, riskProfilesData) {
        const dataToUpdate = {
            ...portfolioData,
            updated_at: new Date()
        };

        if (classIds !== undefined) {
            dataToUpdate.classes = classIds && classIds.length > 0 ? JSON.stringify(classIds) : null;
        }

        if (riskProfilesData !== undefined) {
            dataToUpdate.risk_profiles = riskProfilesData && riskProfilesData.length > 0 ? JSON.stringify(riskProfilesData) : null;
        }

        await db('portfolios').where({ id }).update(dataToUpdate);
    }

    async softDelete(id) {
        return db('portfolios').where({ id }).update({ is_active: false });
    }

    async getClasses() {
        return db('portfolio_classes').select('*');
    }
}

module.exports = new PortfolioRepository();
