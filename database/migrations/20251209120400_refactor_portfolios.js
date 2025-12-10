/**
 * Миграция для реорганизации структуры портфелей
 * - Переносим данные из portfolio_risk_profiles и portfolio_instruments в JSON поле risk_profiles
 * - Переносим данные из portfolio_class_links в JSON поле classes
 * - Добавляем поля created_by и updated_by
 * - Удаляем таблицы portfolio_risk_profiles, portfolio_instruments, portfolio_class_links
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // 1. Добавляем JSON поля и поля created_by/updated_by в portfolios
        .table('portfolios', (table) => {
            table.json('classes').nullable();
            table.json('risk_profiles').nullable();
            table.bigInteger('created_by').unsigned().nullable();
            table.bigInteger('updated_by').unsigned().nullable();
        })
        // 2. Добавляем FK на users (если таблица существует)
        .then(async () => {
            const hasUsersTable = await knex.schema.hasTable('users');
            if (hasUsersTable) {
                await knex.schema.table('portfolios', (table) => {
                    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
                    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
                });
            }
        })
        // 3. Переносим данные из portfolio_class_links в JSON поле classes
        .then(async () => {
            const hasClassLinksTable = await knex.schema.hasTable('portfolio_class_links');
            
            if (hasClassLinksTable) {
                const portfolios = await knex('portfolios').select('id');
                
                for (const portfolio of portfolios) {
                    const classLinks = await knex('portfolio_class_links')
                        .where('portfolio_id', portfolio.id)
                        .select('class_id');
                    
                    const classIds = classLinks.map(link => link.class_id);
                    
                    await knex('portfolios')
                        .where('id', portfolio.id)
                        .update({ classes: JSON.stringify(classIds) });
                }
            }
        })
        // 4. Переносим данные из portfolio_risk_profiles и portfolio_instruments в JSON поле risk_profiles
        .then(async () => {
            const hasRiskProfilesTable = await knex.schema.hasTable('portfolio_risk_profiles');
            
            if (hasRiskProfilesTable) {
                const portfolios = await knex('portfolios').select('id');
                
                for (const portfolio of portfolios) {
                    const riskProfiles = await knex('portfolio_risk_profiles')
                        .where('portfolio_id', portfolio.id)
                        .select('id', 'profile_type', 'potential_yield_percent');
                    
                    const riskProfilesData = [];
                    
                    for (const profile of riskProfiles) {
                        const hasInstrumentsTable = await knex.schema.hasTable('portfolio_instruments');
                        let initialCapital = [];
                        let topUp = [];
                        
                        if (hasInstrumentsTable) {
                            const instruments = await knex('portfolio_instruments')
                                .where('portfolio_risk_profile_id', profile.id)
                                .select('product_id', 'bucket_type', 'share_percent', 'order_index');
                            
                            initialCapital = instruments
                                .filter(i => i.bucket_type === 'INITIAL_CAPITAL')
                                .map(i => ({
                                    product_id: i.product_id,
                                    share_percent: parseFloat(i.share_percent),
                                    order_index: i.order_index
                                }));
                            
                            topUp = instruments
                                .filter(i => i.bucket_type === 'TOP_UP')
                                .map(i => ({
                                    product_id: i.product_id,
                                    share_percent: parseFloat(i.share_percent),
                                    order_index: i.order_index
                                }));
                        }
                        
                        riskProfilesData.push({
                            profile_type: profile.profile_type,
                            potential_yield_percent: profile.potential_yield_percent ? parseFloat(profile.potential_yield_percent) : null,
                            initial_capital: initialCapital,
                            top_up: topUp
                        });
                    }
                    
                    await knex('portfolios')
                        .where('id', portfolio.id)
                        .update({ risk_profiles: JSON.stringify(riskProfilesData) });
                }
            }
        })
        // 5. Удаляем старые таблицы
        .then(() => {
            return knex.schema
                .dropTableIfExists('portfolio_instruments')
                .dropTableIfExists('portfolio_risk_profiles')
                .dropTableIfExists('portfolio_class_links');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        // 1. Создаем обратно таблицы
        .createTable('portfolio_class_links', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_id').unsigned().notNullable()
                .references('id').inTable('portfolios').onDelete('CASCADE');
            table.integer('class_id').unsigned().notNullable()
                .references('id').inTable('portfolio_classes').onDelete('CASCADE');
        })
        .createTable('portfolio_risk_profiles', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_id').unsigned().notNullable()
                .references('id').inTable('portfolios').onDelete('CASCADE');
            table.enu('profile_type', ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).notNullable();
            table.decimal('potential_yield_percent', 5, 2).nullable();
        })
        .createTable('portfolio_instruments', (table) => {
            table.bigIncrements('id').primary();
            table.bigInteger('portfolio_risk_profile_id').unsigned().notNullable()
                .references('id').inTable('portfolio_risk_profiles').onDelete('CASCADE');
            table.bigInteger('product_id').unsigned().notNullable()
                .references('id').inTable('products').onDelete('RESTRICT');
            table.enu('bucket_type', ['INITIAL_CAPITAL', 'TOP_UP']).nullable();
            table.decimal('share_percent', 5, 2).notNullable();
            table.integer('order_index').nullable();
        })
        // 2. Восстанавливаем данные из JSON полей
        .then(async () => {
            const portfolios = await knex('portfolios')
                .whereNotNull('classes')
                .orWhereNotNull('risk_profiles')
                .select('id', 'classes', 'risk_profiles');
            
            for (const portfolio of portfolios) {
                // Восстанавливаем classes
                if (portfolio.classes) {
                    const classIds = typeof portfolio.classes === 'string' 
                        ? JSON.parse(portfolio.classes) 
                        : portfolio.classes;
                    
                    if (Array.isArray(classIds)) {
                        const links = classIds.map(classId => ({
                            portfolio_id: portfolio.id,
                            class_id: classId
                        }));
                        if (links.length > 0) {
                            await knex('portfolio_class_links').insert(links);
                        }
                    }
                }
                
                // Восстанавливаем risk_profiles
                if (portfolio.risk_profiles) {
                    const riskProfiles = typeof portfolio.risk_profiles === 'string'
                        ? JSON.parse(portfolio.risk_profiles)
                        : portfolio.risk_profiles;
                    
                    if (Array.isArray(riskProfiles)) {
                        for (const profile of riskProfiles) {
                            const [profileId] = await knex('portfolio_risk_profiles').insert({
                                portfolio_id: portfolio.id,
                                profile_type: profile.profile_type,
                                potential_yield_percent: profile.potential_yield_percent
                            });
                            
                            // Восстанавливаем instruments
                            const instruments = [];
                            if (profile.initial_capital && Array.isArray(profile.initial_capital)) {
                                instruments.push(...profile.initial_capital.map(inst => ({
                                    portfolio_risk_profile_id: profileId,
                                    product_id: inst.product_id,
                                    bucket_type: 'INITIAL_CAPITAL',
                                    share_percent: inst.share_percent,
                                    order_index: inst.order_index
                                })));
                            }
                            if (profile.top_up && Array.isArray(profile.top_up)) {
                                instruments.push(...profile.top_up.map(inst => ({
                                    portfolio_risk_profile_id: profileId,
                                    product_id: inst.product_id,
                                    bucket_type: 'TOP_UP',
                                    share_percent: inst.share_percent,
                                    order_index: inst.order_index
                                })));
                            }
                            
                            if (instruments.length > 0) {
                                await knex('portfolio_instruments').insert(instruments);
                            }
                        }
                    }
                }
            }
        })
        // 3. Удаляем JSON поля и created_by/updated_by
        .then(() => {
            return knex.schema.table('portfolios', (table) => {
                table.dropColumn('classes');
                table.dropColumn('risk_profiles');
                table.dropColumn('created_by');
                table.dropColumn('updated_by');
            });
        });
};


