const portfolioRepository = require('../repositories/portfolioRepository');

class PortfolioService {
    async getAllPortfolios(agentId, query) {
        // Basic filter mapping
        const { includeDefaults = 'true', amount_from, amount_to, term_months } = query;
        return portfolioRepository.findAll({
            agentId,
            includeDefaults: includeDefaults === 'true',
            filters: { amount_from, amount_to } // pass through needed filters
        });
    }

    async getPortfolioClasses() {
        return portfolioRepository.getClasses();
    }

    async getPortfolioById(id) {
        return portfolioRepository.findById(id);
    }

    async createPortfolio(agentId, userId, data) {
        const { classes, risk_profiles, ...fields } = data;
        fields.agent_id = agentId;
        fields.created_by = userId;
        fields.updated_by = userId;
        const newId = await portfolioRepository.create(fields, classes, risk_profiles);
        return this.getPortfolioById(newId);
    }

    async updatePortfolio(id, agentId, userId, isAdmin, data) {
        const portfolio = await portfolioRepository.findById(id);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.agent_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can edit default portfolios' };
        }
        if (portfolio.agent_id !== null && portfolio.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        const { classes, risk_profiles, ...fields } = data;
        fields.updated_by = userId;
        await portfolioRepository.update(id, fields, classes, risk_profiles);
        return this.getPortfolioById(id);
    }

    async deletePortfolio(id, agentId, isAdmin) {
        const portfolio = await portfolioRepository.findById(id);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.agent_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can delete default portfolios' };
        }
        if (portfolio.agent_id !== null && portfolio.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        await portfolioRepository.softDelete(id);
        return { success: true };
    }

    async clonePortfolio(id, agentId, userId) {
        const portfolio = await portfolioRepository.findById(id);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.agent_id !== null) {
            throw { status: 400, message: 'Only default portfolios can be cloned' };
        }

        const { id: _, created_at, updated_at, created_by, updated_by, classes, risk_profiles, ...data } = portfolio;
        data.agent_id = agentId;
        data.is_default = false;
        data.created_by = userId;
        data.updated_by = userId;

        // classes уже массив ID, risk_profiles уже в нужном формате
        const classIds = Array.isArray(classes) ? classes : [];
        const riskProfilesData = Array.isArray(risk_profiles) ? risk_profiles : [];

        const newId = await portfolioRepository.create(data, classIds, riskProfilesData);
        return this.getPortfolioById(newId);
    }
}

module.exports = new PortfolioService();
