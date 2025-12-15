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

        // Fetch Classes - ПРИОРИТЕТ: читаем из JSON поля portfolios.classes (основное хранилище)
        let classes = [];
        try {
            // Сначала пытаемся прочитать из JSON поля portfolios.classes
            if (portfolio.classes) {
                try {
                    const classIds = typeof portfolio.classes === 'string' 
                        ? JSON.parse(portfolio.classes) 
                        : portfolio.classes;
                    if (Array.isArray(classIds) && classIds.length > 0) {
                        classes = await db('portfolio_classes')
                            .whereIn('id', classIds)
                            .select('*');
                        console.log(`[PortfolioRepository] Loaded ${classes.length} classes from JSON field for portfolio ${id}`);
                    }
                } catch (e) {
                    console.warn('Could not parse classes from JSON field:', e.message);
                }
            }
            
            // Если JSON поле пустое или не существует, пробуем прочитать из portfolio_class_links (fallback)
            if (classes.length === 0) {
                const tableExists = await db.schema.hasTable('portfolio_class_links');
                if (tableExists) {
                    classes = await db('portfolio_class_links')
                        .join('portfolio_classes', 'portfolio_class_links.class_id', 'portfolio_classes.id')
                        .where('portfolio_class_links.portfolio_id', id)
                        .select('portfolio_classes.*');
                    if (classes.length > 0) {
                        console.log(`[PortfolioRepository] Loaded ${classes.length} classes from portfolio_class_links (fallback) for portfolio ${id}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching classes:', error.message);
            // Continue without classes if error
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
