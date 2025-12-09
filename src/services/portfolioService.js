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

    async getPortfolioById(id) {
        return portfolioRepository.findById(id);
    }

    async createPortfolio(agentId, data) {
        const { classes, riskProfiles, ...fields } = data;
        fields.agent_id = agentId;
        const newId = await portfolioRepository.create(fields, classes, riskProfiles);
        return this.getPortfolioById(newId);
    }

    async updatePortfolio(id, agentId, isAdmin, data) {
        const portfolio = await portfolioRepository.findById(id);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.agent_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can edit default portfolios' };
        }
        if (portfolio.agent_id !== null && portfolio.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        const { classes, riskProfiles, ...fields } = data;
        await portfolioRepository.update(id, fields, classes, riskProfiles);
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

    async clonePortfolio(id, agentId) {
        const portfolio = await portfolioRepository.findById(id);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.agent_id !== null) {
            throw { status: 400, message: 'Only default portfolios can be cloned' };
        }

        const { id: _, created_at, updated_at, classes, riskProfiles, ...data } = portfolio;
        data.agent_id = agentId;
        data.is_default = false;

        // Map classes to IDs
        const classIds = classes.map(c => c.id);

        // Map risk profiles and instruments
        const riskProfilesData = riskProfiles.map(rp => {
            const { id: __, portfolio_id, instruments, ...rpData } = rp;
            const instrumentsData = instruments.map(i => {
                const { id: ___, portfolio_risk_profile_id, ...iData } = i;
                return iData;
            });
            return { ...rpData, instruments: instrumentsData };
        });

        const newId = await portfolioRepository.create(data, classIds, riskProfilesData);
        return this.getPortfolioById(newId);
    }
}

module.exports = new PortfolioService();
