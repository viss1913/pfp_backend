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

        // Fetch Classes - check if table exists first
        let classes = [];
        try {
            const tableExists = await db.schema.hasTable('portfolio_class_links');
            if (tableExists) {
                classes = await db('portfolio_class_links')
                    .join('portfolio_classes', 'portfolio_class_links.class_id', 'portfolio_classes.id')
                    .where('portfolio_class_links.portfolio_id', id)
                    .select('portfolio_classes.*');
            } else {
                console.warn('⚠️  Table portfolio_class_links does not exist. Run migrations!');
                // Try to get classes from JSON field if exists
                if (portfolio.classes) {
                    try {
                        const classIds = typeof portfolio.classes === 'string' 
                            ? JSON.parse(portfolio.classes) 
                            : portfolio.classes;
                        if (Array.isArray(classIds) && classIds.length > 0) {
                            classes = await db('portfolio_classes')
                                .whereIn('id', classIds)
                                .select('*');
                        }
                    } catch (e) {
                        console.warn('Could not parse classes from JSON field:', e.message);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching classes:', error.message);
            // Continue without classes if table doesn't exist
        }

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
            // Update basic fields (only if there are fields to update)
            if (Object.keys(portfolioData).length > 0) {
                await trx('portfolios').where({ id }).update({ ...portfolioData, updated_at: new Date() });
            } else {
                // Still update updated_at even if no other fields changed
                await trx('portfolios').where({ id }).update({ updated_at: new Date() });
            }

            // Update Classes: Delete all links, re-insert
            if (classIds !== undefined) {
                await trx('portfolio_class_links').where({ portfolio_id: id }).del();
                if (classIds && classIds.length > 0) {
                    const links = classIds.map(cid => ({ portfolio_id: id, class_id: cid }));
                    await trx('portfolio_class_links').insert(links);
                }
            }

            // Update Risk Profiles: Delete all profiles (cascade deletes instruments), re-insert
            // Note: This changes IDs of profiles. If that matters, we need smarter update. 
            // Requirement says "old connections are deleted and created again". So full wipe is OK.
            if (riskProfilesData !== undefined) {
                // Delete all existing profiles (cascade will delete instruments)
                await trx('portfolio_risk_profiles').where({ portfolio_id: id }).del();

                // Insert new profiles if provided
                if (riskProfilesData && riskProfilesData.length > 0) {
                    for (const profile of riskProfilesData) {
                        const { instruments, ...profileFields } = profile;
                        const insertResult = await trx('portfolio_risk_profiles').insert({
                            ...profileFields,
                            portfolio_id: id
                        });
                        const profileId = Array.isArray(insertResult) ? insertResult[0] : insertResult;

                        if (instruments && instruments.length > 0) {
                            const instrumentsWithId = instruments.map(inst => ({
                                ...inst,
                                portfolio_risk_profile_id: profileId
                            }));
                            await trx('portfolio_instruments').insert(instrumentsWithId);
                        }
                    }
                }
            }
        });
    }

    async softDelete(id) {
        return db('portfolios').where({ id }).update({ is_active: false });
    }

    async getClasses() {
        return db('portfolio_classes').select('*');
    }

    async findByCriteria({ classId, amount, term }) {
        const query = db('portfolios').where({ is_active: true });
        if (amount !== undefined) {
            query.where('amount_from', '<=', amount)
                .where('amount_to', '>=', amount);
        }
        if (term !== undefined) {
            query.where('term_from_months', '<=', term)
                .where('term_to_months', '>=', term);
        }
        const candidates = await query;
        return candidates.find(p => {
            const classes = typeof p.classes === 'string' ? JSON.parse(p.classes) : p.classes;
            if (!Array.isArray(classes)) return false;
            return classes.includes(Number(classId));
        }) || null;
    }
}

module.exports = new PortfolioRepository();
