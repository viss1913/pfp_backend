const portfolioRepository = require('../repositories/portfolioRepository');

class PortfolioService {
    async getAllPortfolios(projectId, query) {
        // Basic filter mapping
        const { includeDefaults = 'true', amount_from, amount_to, term_months } = query;
        return portfolioRepository.findAll({
            projectId,
            includeDefaults: includeDefaults === 'true',
            filters: { amount_from, amount_to } // pass through needed filters
        });
    }

    async getPortfolioClasses() {
        return portfolioRepository.getClasses();
    }

    async getPortfolioById(id, projectId = null) {
        const portfolio = await portfolioRepository.findById(id, projectId);
        if (!portfolio || !portfolio.is_active) return null;
        return portfolio;
    }

    async createPortfolio(agentId, projectId, data) {
        const { classes, riskProfiles, ...fields } = data;
        fields.agent_id = agentId;
        fields.project_id = projectId;
        const newId = await portfolioRepository.create(fields, classes, riskProfiles);
        return this.getPortfolioById(newId, projectId);
    }

    async updatePortfolio(id, agentId, projectId, isAdmin, data) {
        const portfolio = await portfolioRepository.findById(id, projectId);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.project_id === null && !isAdmin) {
            throw { status: 403, message: 'Only admin can edit default portfolios' };
        }
        if (portfolio.agent_id !== null && portfolio.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        const { classes, riskProfiles, id: _, agent_id, project_id, is_default, is_active, created_at, updated_at, ...fields } = data;
        await portfolioRepository.update(id, fields, classes, riskProfiles, projectId);
        return this.getPortfolioById(id, projectId);
    }

    async deletePortfolio(id, agentId, projectId, isAdmin) {
        const portfolio = await portfolioRepository.findById(id, projectId);

        // If portfolio doesn't exist at all, 404 is appropriate
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        // If already soft-deleted, return success (idempotent)
        if (portfolio.is_active === false || portfolio.is_active === 0) {
            return { success: true };
        }

        if (portfolio.project_id === null && !isAdmin) {
            throw { status: 403, message: 'Cannot delete default portfolios' };
        }
        if (portfolio.agent_id !== null && portfolio.agent_id !== agentId && !isAdmin) {
            throw { status: 403, message: 'Access denied' };
        }

        await portfolioRepository.softDelete(id, projectId);
        return { success: true };
    }

    async clonePortfolio(id, agentId, projectId) {
        const portfolio = await portfolioRepository.findById(id, projectId);
        if (!portfolio) throw { status: 404, message: 'Portfolio not found' };

        if (portfolio.project_id !== null && portfolio.agent_id !== null) {
            throw { status: 400, message: 'Only default or project-global portfolios can be cloned' };
        }

        const { id: _, created_at, updated_at, classes, riskProfiles, ...data } = portfolio;
        data.agent_id = agentId;
        data.project_id = projectId;
        data.is_default = false;

        // Map classes to IDs
        const classIds = (classes || []).map(c => c.id);

        // Map risk profiles and instruments
        const riskProfilesData = (riskProfiles || []).map(rp => {
            const { id: __, portfolio_id, instruments, ...rpData } = rp;
            const instrumentsData = (instruments || []).map(i => {
                const { id: ___, portfolio_risk_profile_id, ...iData } = i;
                return iData;
            });
            return { ...rpData, instruments: instrumentsData };
        });

        const newId = await portfolioRepository.create(data, classIds, riskProfilesData);
        return this.getPortfolioById(newId, projectId);
    }
}

module.exports = new PortfolioService();
