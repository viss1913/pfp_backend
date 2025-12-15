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

        const portfolios = await query;
        
        // Конвертируем risk_profiles в riskProfiles для единообразия API
        portfolios.forEach(portfolio => {
            if (portfolio.risk_profiles) {
                try {
                    const profiles = typeof portfolio.risk_profiles === 'string' 
                        ? JSON.parse(portfolio.risk_profiles) 
                        : portfolio.risk_profiles;
                    
                    // Конвертируем в формат с instruments
                    portfolio.riskProfiles = profiles.map(profile => {
                        if (profile.instruments !== undefined) {
                            return profile; // Уже в новом формате
                        }
                        // Конвертируем старый формат
                        const instruments = [];
                        if (profile.initial_capital) {
                            profile.initial_capital.forEach(item => {
                                instruments.push({
                                    product_id: item.product_id,
                                    bucket_type: 'INITIAL_CAPITAL',
                                    share_percent: item.share_percent,
                                    order_index: item.order_index || null
                                });
                            });
                        }
                        if (profile.initial_replenishment || profile.top_up) {
                            (profile.initial_replenishment || profile.top_up).forEach(item => {
                                instruments.push({
                                    product_id: item.product_id,
                                    bucket_type: 'TOP_UP',
                                    share_percent: item.share_percent,
                                    order_index: item.order_index || null
                                });
                            });
                        }
                        return {
                            profile_type: profile.profile_type,
                            potential_yield_percent: profile.potential_yield_percent || null,
                            instruments
                        };
                    });
                } catch (e) {
                    console.warn('Could not parse risk_profiles:', e.message);
                    portfolio.riskProfiles = [];
                }
            } else {
                portfolio.riskProfiles = [];
            }
            delete portfolio.risk_profiles; // Удаляем старое поле
        });

        return portfolios;
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

        // Используем ТОЛЬКО JSON поле risk_profiles - просто и понятно
        let profiles = [];
        if (portfolio.risk_profiles) {
            try {
                profiles = typeof portfolio.risk_profiles === 'string' 
                    ? JSON.parse(portfolio.risk_profiles) 
                    : portfolio.risk_profiles;
            } catch (e) {
                console.warn('Could not parse risk_profiles from JSON field:', e.message);
            }
        }

        // Конвертируем старый формат (initial_capital/initial_replenishment) в новый (instruments)
        // для единообразия в ответе API
        profiles = profiles.map(profile => {
            // Если уже в новом формате (есть instruments), возвращаем как есть
            if (profile.instruments !== undefined) {
                return profile;
            }

            // Конвертируем старый формат в новый
            const instruments = [];
            
            // initial_capital -> instruments с bucket_type: INITIAL_CAPITAL
            if (profile.initial_capital && Array.isArray(profile.initial_capital)) {
                profile.initial_capital.forEach(item => {
                    instruments.push({
                        product_id: item.product_id,
                        bucket_type: 'INITIAL_CAPITAL',
                        share_percent: item.share_percent,
                        order_index: item.order_index || null
                    });
                });
            }
            
            // initial_replenishment или top_up -> instruments с bucket_type: TOP_UP
            const replenishment = profile.initial_replenishment || profile.top_up;
            if (replenishment && Array.isArray(replenishment)) {
                replenishment.forEach(item => {
                    instruments.push({
                        product_id: item.product_id,
                        bucket_type: 'TOP_UP',
                        share_percent: item.share_percent,
                        order_index: item.order_index || null
                    });
                });
            }

            // Возвращаем профиль в новом формате
            return {
                profile_type: profile.profile_type,
                potential_yield_percent: profile.potential_yield_percent || null,
                instruments: instruments.length > 0 ? instruments : []
            };
        });

        // Build result object
        const result = { ...portfolio };
        result.classes = classes;
        result.riskProfiles = profiles;
        
        // Удаляем старое поле, чтобы не было путаницы
        delete result.risk_profiles;

        return result;
    }

    async create(portfolioData, classIds, riskProfilesData) {
        return db.transaction(async (trx) => {
            // Конвертируем riskProfiles в старый формат для JSON поля (если нужно)
            // Или сохраняем в новом формате с instruments
            if (riskProfilesData && riskProfilesData.length > 0) {
                // Очищаем от лишних полей (id, portfolio_risk_profile_id)
                const cleanProfiles = riskProfilesData.map(profile => {
                    const { id, portfolio_id, portfolio_risk_profile_id, ...cleanProfile } = profile;
                    if (cleanProfile.instruments) {
                        cleanProfile.instruments = cleanProfile.instruments.map(inst => {
                            const { id: instId, portfolio_risk_profile_id: prpId, ...cleanInst } = inst;
                            return cleanInst;
                        });
                    }
                    return cleanProfile;
                });
                portfolioData.risk_profiles = JSON.stringify(cleanProfiles);
            }

            const [id] = await trx('portfolios').insert(portfolioData);

            // Links to classes (если используем нормализованные таблицы)
            if (classIds && classIds.length > 0) {
                const classLinksTableExists = await trx.schema.hasTable('portfolio_class_links');
                if (classLinksTableExists) {
                    const links = classIds.map(cid => ({ portfolio_id: id, class_id: cid }));
                    await trx('portfolio_class_links').insert(links);
                } else {
                    // Fallback: сохраняем в JSON поле
                    portfolioData.classes = JSON.stringify(classIds);
                    await trx('portfolios').where({ id }).update({ classes: JSON.stringify(classIds) });
                }
            }

            return id;
        });
    }

    async update(id, portfolioData, classIds, riskProfilesData) {
        return db.transaction(async (trx) => {
            // Обновляем risk_profiles в JSON поле (просто и понятно!)
            if (riskProfilesData !== undefined) {
                // Очищаем от лишних полей (id, portfolio_risk_profile_id)
                const cleanProfiles = riskProfilesData.map(profile => {
                    const { id: profileId, portfolio_id, portfolio_risk_profile_id, ...cleanProfile } = profile;
                    if (cleanProfile.instruments) {
                        cleanProfile.instruments = cleanProfile.instruments.map(inst => {
                            const { id: instId, portfolio_risk_profile_id: prpId, ...cleanInst } = inst;
                            return cleanInst;
                        });
                    }
                    return cleanProfile;
                });
                portfolioData.risk_profiles = JSON.stringify(cleanProfiles);
            }

            // Update basic fields
            if (Object.keys(portfolioData).length > 0) {
                await trx('portfolios').where({ id }).update({ ...portfolioData, updated_at: new Date() });
            } else {
                // Still update updated_at even if no other fields changed
                await trx('portfolios').where({ id }).update({ updated_at: new Date() });
            }

            // Update Classes: Delete all links, re-insert (если используем нормализованные таблицы)
            if (classIds !== undefined) {
                const classLinksTableExists = await trx.schema.hasTable('portfolio_class_links');
                if (classLinksTableExists) {
                    await trx('portfolio_class_links').where({ portfolio_id: id }).del();
                    if (classIds && classIds.length > 0) {
                        const links = classIds.map(cid => ({ portfolio_id: id, class_id: cid }));
                        await trx('portfolio_class_links').insert(links);
                    }
                } else {
                    // Fallback: сохраняем в JSON поле
                    await trx('portfolios').where({ id }).update({ classes: JSON.stringify(classIds || []) });
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
