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

        return query;
    }

    async findById(id) {
        const portfolio = await db('portfolios').where({ id }).first();
        if (!portfolio) return null;

        // Fetch Classes
        const classes = await db('portfolio_class_links')
            .join('portfolio_classes', 'portfolio_class_links.class_id', 'portfolio_classes.id')
            .where('portfolio_class_links.portfolio_id', id)
            .select('portfolio_classes.*');

        // Fetch Risk Profiles
        const profiles = await db('portfolio_risk_profiles').where({ portfolio_id: id });

        // For each profile, fetch instruments
        for (const profile of profiles) {
            profile.instruments = await db('portfolio_instruments').where({ portfolio_risk_profile_id: profile.id });
        }

        return {
            ...portfolio,
            classes,
            riskProfiles: profiles
        };
    }

    async create(portfolioData, classIds, riskProfilesData) {
        return db.transaction(async (trx) => {
            const [id] = await trx('portfolios').insert(portfolioData);

            // Links to classes
            if (classIds && classIds.length > 0) {
                // Assume classIds are valid IDs
                const links = classIds.map(cid => ({ portfolio_id: id, class_id: cid }));
                await trx('portfolio_class_links').insert(links);
            }

            // Risk Profiles & Instruments
            if (riskProfilesData && riskProfilesData.length > 0) {
                for (const profile of riskProfilesData) {
                    const { instruments, ...profileFields } = profile;
                    const [profileId] = await trx('portfolio_risk_profiles').insert({
                        ...profileFields,
                        portfolio_id: id
                    });

                    if (instruments && instruments.length > 0) {
                        const instrumentsWithId = instruments.map(inst => ({
                            ...inst,
                            portfolio_risk_profile_id: profileId
                        }));
                        await trx('portfolio_instruments').insert(instrumentsWithId);
                    }
                }
            }

            return id;
        });
    }

    async update(id, portfolioData, classIds, riskProfilesData) {
        return db.transaction(async (trx) => {
            // Update basic fields
            await trx('portfolios').where({ id }).update({ ...portfolioData, updated_at: new Date() });

            // Update Classes: Delete all links, re-insert
            if (classIds) {
                await trx('portfolio_class_links').where({ portfolio_id: id }).del();
                if (classIds.length > 0) {
                    const links = classIds.map(cid => ({ portfolio_id: id, class_id: cid }));
                    await trx('portfolio_class_links').insert(links);
                }
            }

            // Update Risk Profiles: Delete all profiles (cascade deletes instruments), re-insert
            // Note: This changes IDs of profiles. If that matters, we need smarter update. 
            // Requirement says "old connections are deleted and created again". So full wipe is OK.
            if (riskProfilesData) {
                // First find profiles to ensure we delete them? OR just delete by portfolio_id?
                // Cascade delete on instruments handles instruments. 
                // We just need to delete profiles.
                await trx('portfolio_risk_profiles').where({ portfolio_id: id }).del();

                for (const profile of riskProfilesData) {
                    const { instruments, ...profileFields } = profile;
                    const [profileId] = await trx('portfolio_risk_profiles').insert({
                        ...profileFields,
                        portfolio_id: id
                    });

                    if (instruments && instruments.length > 0) {
                        const instrumentsWithId = instruments.map(inst => ({
                            ...inst,
                            portfolio_risk_profile_id: profileId
                        }));
                        await trx('portfolio_instruments').insert(instrumentsWithId);
                    }
                }
            }
        });
    }

    async softDelete(id) {
        return db('portfolios').where({ id }).update({ is_active: false });
    }
}

module.exports = new PortfolioRepository();
