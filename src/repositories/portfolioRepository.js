const db = require('../config/database');

class PortfolioRepository {
    /**
     * Helper to transform raw DB portfolio row into API format with parsed instruments
     */
    async _transformPortfolio(portfolio, db) {
        console.log('[PortfolioRepo] _transformPortfolio called for id:', portfolio ? portfolio.id : 'null');
        if (!portfolio) return null;

        // Fetch Classes - ПРИОРИТЕТ: читаем из JSON поля portfolios.classes (основное хранилище)
        let classes = [];
        try {
            // Сначала пытаемся прочитать из JSON поля portfolios.classes
            if (portfolio.classes) {
                try {
                    const parsed = typeof portfolio.classes === 'string'
                        ? JSON.parse(portfolio.classes)
                        : portfolio.classes;
                    classes = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    // Fallback for comma-separated string
                    if (typeof portfolio.classes === 'string') {
                        classes = portfolio.classes.split(',').map(id => Number(id.trim()));
                    }
                }

                if (classes.length > 0) {
                    console.log('[PortfolioRepo] Fetching classes for portfolio', portfolio.id, 'ids:', classes);
                    classes = await db('portfolio_classes')
                        .whereIn('id', classes)
                        .select('*');
                    console.log('[PortfolioRepo] Fetched classes:', classes.length);
                }
            }

            // Если JSON поле пустое или не существует, пробуем прочитать из portfolio_class_links (fallback)
            if (classes.length === 0) {
                const tableExists = await db.schema.hasTable('portfolio_class_links');
                if (tableExists) {
                    classes = await db('portfolio_class_links')
                        .join('portfolio_classes', 'portfolio_class_links.class_id', 'portfolio_classes.id')
                        .where('portfolio_class_links.portfolio_id', portfolio.id)
                        .select('portfolio_classes.*');
                }
            }
        } catch (error) {
            console.error('Error fetching classes:', error.message);
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
        profiles = profiles.map(profile => {
            if (profile.instruments !== undefined) return profile;

            const instruments = [];
            // initial_capital -> instruments with bucket_type: INITIAL_CAPITAL
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
            // initial_replenishment or top_up -> instruments with bucket_type: TOP_UP
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

            return {
                profile_type: profile.profile_type,
                potential_yield_percent: profile.potential_yield_percent || null,
                instruments: instruments.length > 0 ? instruments : []
            };
        });

        const result = { ...portfolio };
        result.classes = classes;
        result.riskProfiles = profiles;
        delete result.risk_profiles;
        return result;
    }

    async findAll({ projectId = null, filters = {}, includeDefaults = true }) {
        const query = db('portfolios').select('*').where('is_active', true);

        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId);
                if (includeDefaults) {
                    builder.orWhereNull('project_id');
                }
            }
        });

        if (filters.amount_from) query.where('amount_from', '>=', filters.amount_from);
        if (filters.agent_id) query.where('agent_id', filters.agent_id);

        const portfolios = await query;
        return Promise.all(portfolios.map(p => this._transformPortfolio(p, db)));
    }

    async findById(id, projectId = null) {
        let query = db('portfolios').where({ id });
        if (projectId) {
            query.where((builder) => {
                builder.where({ project_id: projectId }).orWhereNull('project_id');
            });
        }
        const portfolio = await query.first();
        if (!portfolio) return null;
        return this._transformPortfolio(portfolio, db);
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
                let query = trx('portfolios').where({ id });
                if (projectId) query.where({ project_id: projectId });
                await query.update({ ...portfolioData, updated_at: new Date() });
            } else {
                // Still update updated_at even if no other fields changed
                let query = trx('portfolios').where({ id });
                if (projectId) query.where({ project_id: projectId });
                await query.update({ updated_at: new Date() });
            }

            // Update Classes: Храним ТОЛЬКО в JSON поле portfolios.classes (просто и понятно!)
            if (classIds !== undefined) {
                // Нормализуем: null или не-массив превращаем в пустой массив
                let normalizedClassIds = Array.isArray(classIds) ? classIds : [];

                // Дополнительная нормализация: если это массив объектов, извлекаем ID
                if (normalizedClassIds.length > 0 && typeof normalizedClassIds[0] === 'object' && normalizedClassIds[0] !== null) {
                    normalizedClassIds = normalizedClassIds.map(c => typeof c === 'object' && c !== null ? c.id : c).filter(id => id !== undefined && id !== null);
                    console.log(`[PortfolioRepository] Extracted IDs from objects array:`, normalizedClassIds);
                }

                console.log(`[PortfolioRepository] Updating classes for portfolio ${id}:`, classIds, '-> normalized:', normalizedClassIds);

                // Обновляем JSON поле classes в таблице portfolios
                // MySQL JSON поле - всегда используем JSON.stringify (даже для пустого массива)
                const classesJson = JSON.stringify(normalizedClassIds);
                const updateResult = await trx('portfolios').where({ id }).update({ classes: classesJson });
                console.log(`[PortfolioRepository] ✅ Updated classes JSON field in portfolios table:`, normalizedClassIds);
                console.log(`[PortfolioRepository] Update result (affected rows):`, updateResult);

                // Также обновляем таблицу связей portfolio_class_links (если она используется для других целей)
                // Но основное хранилище - JSON поле в portfolios
                const classLinksTableExists = await trx.schema.hasTable('portfolio_class_links');
                if (classLinksTableExists) {
                    // Синхронизируем таблицу связей с JSON полем (для обратной совместимости)
                    const deletedCount = await trx('portfolio_class_links').where({ portfolio_id: id }).del();
                    console.log(`[PortfolioRepository] Deleted ${deletedCount} existing class links for portfolio ${id}`);
                    if (normalizedClassIds.length > 0) {
                        const links = normalizedClassIds.map(cid => ({ portfolio_id: id, class_id: cid }));
                        await trx('portfolio_class_links').insert(links);
                        console.log(`[PortfolioRepository] Created ${links.length} new class links for portfolio ${id} (sync with JSON field)`);
                    }
                }
            } else {
                console.log(`[PortfolioRepository] classes not provided, skipping update for portfolio ${id}`);
            }
        });
    }

    async softDelete(id, projectId = null) {
        let query = db('portfolios').where({ id });
        if (projectId) query.where({ project_id: projectId });
        return query.update({ is_active: false });
    }

    async getClasses(projectId = null) {
        const query = db('portfolio_classes').select('*');
        query.where((builder) => {
            if (projectId) {
                builder.where('project_id', projectId).orWhereNull('project_id');
            } else {
                builder.whereNull('project_id');
            }
        });
        return query;
    }

    async findByCriteria({ projectId = null, classId, amount, term }) {
        console.log('[PortfolioRepo] findByCriteria called with:', { projectId, classId, amount, term });
        const query = db('portfolios').where({ is_active: true });

        if (projectId) {
            query.where((builder) => {
                builder.where({ project_id: projectId }).orWhereNull('project_id');
            });
        }

        if (amount !== undefined) {
            query.where('amount_from', '<=', amount)
                .where('amount_to', '>=', amount);
        }
        if (term !== undefined) {
            query.where('term_from_months', '<=', term)
                .where('term_to_months', '>=', term);
        }
        console.log('[PortfolioRepo] Executing query...');
        let candidates;
        try {
            // Priority: project-specific (not null) first
            candidates = await query.orderBy('project_id', 'desc');
            console.log(`[PortfolioRepo] Query finished. Found ${candidates.length} candidates.`);
        } catch (e) {
            console.error('[PortfolioRepo] Query failed:', e);
            throw e;
        }
        const found = candidates.find(p => {
            let classes = p.classes;
            if (typeof classes === 'string' && classes.trim() !== '') {
                try {
                    classes = JSON.parse(classes);
                } catch (e) {
                    // Try comma-separated
                    classes = classes.split(',').map(c => Number(c.trim()));
                }
            }
            if (!Array.isArray(classes)) {
                classes = classes ? [Number(classes)] : [];
            }
            return classes.includes(Number(classId));
        });

        return found ? this._transformPortfolio(found, db) : null;
    }
}

module.exports = new PortfolioRepository();
