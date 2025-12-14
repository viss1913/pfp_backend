const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');
const pdsCofinancingService = require('./pdsCofinancingService');

class CalculationService {
    /**
     * Perform First Run calculation for a client request
     * @param {Object} data - CalculationRequest data
     */
    async calculateFirstRun(data) {
        const { goals, client } = data; // client - опциональные данные клиента для НСЖ

        // 1. Fetch System Settings

        // A. Investment Expense Growth (Monthly) from DB
        // User didn't ask to change this to annual yet, keeping as monthly
        let m_month_percent = 0.0;
        try {
            const setting = await settingsService.get('investment_expense_growth_monthly');
            if (setting && setting.value) {
                m_month_percent = Number(setting.value);
            }
        } catch (e) {
            console.warn('Could not fetch investment_expense_growth_monthly, using default 0.0');
        }

        // B. Inflation (Annual) from DB
        let db_inflation_year_percent = 4.0;
        try {
            // Changed key to annual per legacy refactoring
            const setting = await settingsService.get('inflation_rate_year');
            if (setting && setting.value) {
                db_inflation_year_percent = Number(setting.value);
            }
        } catch (e) {
            console.warn('Could not fetch inflation_rate_year, using default 4.0');
        }

        const results = [];

        for (const goal of goals) {
            // Проверяем, является ли цель типом LIFE (goal_type_id: 5 или name: "Жизнь")
            const isLifeGoal = goal.goal_type_id === 5 || goal.name === 'Жизнь';
            
            // Проверяем, является ли цель типом PASSIVE_INCOME (goal_type_id: 2)
            const isPassiveIncomeGoal = goal.goal_type_id === 2;

            // Если это цель типа LIFE, вызываем API НСЖ
            if (isLifeGoal) {
                console.log('=== NSJ CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);
                console.log('Target amount:', goal.target_amount, 'Term months:', goal.term_months);
                console.log('Client data:', JSON.stringify(client || {}, null, 2));
                try {
                    const nsjParams = {
                        target_amount: goal.target_amount,
                        term_months: goal.term_months,
                        client: client || {},
                        payment_variant: goal.payment_variant || 0, // По умолчанию единовременно
                        program: goal.program || process.env.NSJ_DEFAULT_PROGRAM || 'test'
                    };
                    console.log('Calling nsjApiService.calculateLifeInsurance with params:', JSON.stringify(nsjParams, null, 2));
                    const nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
                    console.log('NSJ Result received:', JSON.stringify(nsjResult, null, 2));
                    
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'LIFE',
                        nsj_calculation: {
                            success: nsjResult.success,
                            term_years: nsjResult.term || nsjResult.term_years,
                            garantProfit: nsjResult.garantProfit || 0,
                            risks: nsjResult.risks || [],
                            total_premium: nsjResult.total_premium || nsjResult.total_premium_rur,
                            total_premium_rur: nsjResult.total_premium_rur || nsjResult.total_premium,
                            total_limit: nsjResult.total_limit,
                            payTerm: nsjResult.payTerm,
                            payEndDate: nsjResult.payEndDate,
                            comission: nsjResult.comission || null,
                            rvd: nsjResult.rvd || null,
                            cashSurrenderValues: nsjResult.cashSurrenderValues || null,
                            payments_list: nsjResult.payments_list || [],
                            warnings: nsjResult.warnings || [],
                            calculation_date: nsjResult.calculation_date
                        }
                    });
                    continue; // Пропускаем обычный расчет для LIFE
                } catch (nsjError) {
                    console.error('NSJ API Error for goal:', goal.name, nsjError);
                    const errorMessage = nsjError.message || nsjError.status || 'Unknown error';
                    const errorDetails = nsjError.errors || nsjError.warnings || nsjError.details || [];
                    const fullError = {
                        message: errorMessage,
                        status: nsjError.status,
                        errors: nsjError.errors || [],
                        warnings: nsjError.warnings || [],
                        full_response: nsjError.full_response || null
                    };
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'LIFE',
                        error: `NSJ calculation failed: ${errorMessage}`,
                        nsj_error_details: errorDetails,
                        nsj_error_full: fullError // Полная информация об ошибке для отладки
                    });
                    continue;
                }
            }

            // Если это цель типа PASSIVE_INCOME, используем специальную логику расчета
            if (isPassiveIncomeGoal) {
                console.log('=== PASSIVE INCOME CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);
                console.log('Target monthly income:', goal.target_amount, 'Term months:', goal.term_months);
                
                try {
                    // Шаг 1: Пересчет желаемого дохода с учетом инфляции
                    const inflationAnnualUsed = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
                    const infl_month_decimal = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;
                    const desiredMonthlyIncomeWithInflation = goal.target_amount * Math.pow(1 + infl_month_decimal, goal.term_months);
                    
                    console.log('Desired monthly income (initial):', goal.target_amount);
                    console.log('Desired monthly income (with inflation):', desiredMonthlyIncomeWithInflation);
                    
                    // Шаг 2: Поиск линии доходности по сроку и расчет необходимого капитала
                    const yieldLine = await settingsService.findPassiveIncomeYieldLine(0, goal.term_months, true); // byTermOnly = true
                    
                    if (!yieldLine) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            error: `No yield line found for term ${goal.term_months} months in passive income yield settings`
                        });
                        continue;
                    }
                    
                    console.log('Found yield line:', yieldLine);
                    const yieldPercent = yieldLine.yield_percent;
                    
                    // Расчет необходимого капитала: (желаемый_доход_с_инфляцией * 12 * 100) / yield_percent
                    const requiredCapital = (desiredMonthlyIncomeWithInflation * 12 * 100) / yieldPercent;
                    
                    console.log('Required capital:', requiredCapital);
                    console.log('Yield percent:', yieldPercent);
                    
                    // Шаг 3: Расчет пополнений (без повторной инфляции)
                    const Cost = requiredCapital; // Это уже финальная сумма
                    const CostWithInflation = requiredCapital; // Не применяем инфляцию повторно
                    const Month = goal.term_months;
                    const InitialCapital = goal.initial_capital || 0;
                    
                    // Получаем доходность портфеля (используем yield из линии)
                    const d_annual = yieldPercent;
                    const d_month_decimal = Math.pow(1 + (d_annual / 100), 1 / 12) - 1;
                    const m_month_decimal = m_month_percent / 100;
                    
                    // Future Value of Initial Capital
                    const FutureValueInitial = InitialCapital * Math.pow(1 + d_month_decimal, Month);
                    
                    // Gap (Capital Shortage)
                    const CapitalGap = CostWithInflation - FutureValueInitial;
                    
                    // Initial Replenishment
                    let recommendedReplenishment = 0;
                    
                    if (Math.abs(m_month_decimal - d_month_decimal) < 0.0000001) {
                        recommendedReplenishment = CapitalGap / (Month * Math.pow(1 + d_month_decimal, Month - 1));
                    } else {
                        const numerator = CapitalGap * (m_month_decimal - d_month_decimal);
                        const term1 = 1 + d_month_decimal;
                        const term2 = Math.pow(1 + m_month_decimal, Month - 1);
                        const term3 = Math.pow(1 + d_month_decimal, Month - 1);
                        const denominator = term1 * (term2 - term3);
                        
                        if (denominator !== 0) {
                            recommendedReplenishment = numerator / denominator;
                        }
                    }
                    
                    // Шаг 4: Проверка на ПДС и софинансирование
                    // Для пассивного дохода нужно найти портфель, чтобы проверить наличие ПДС
                    const portfolio = await portfolioRepository.findByCriteria({
                        classId: goal.goal_type_id,
                        amount: requiredCapital,
                        term: goal.term_months
                    });
                    
                    let pdsCofinancingResult = null;
                    
                    if (portfolio) {
                        let riskProfiles = portfolio.risk_profiles;
                        if (typeof riskProfiles === 'string') {
                            try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
                        }
                        
                        const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile);
                        
                        if (profile) {
                            const capitalDistribution = profile.initial_capital || [];
                            let pdsProductId = null;
                            let pdsShareInitial = 0;
                            let pdsShareTopUp = 0;
                            
                            // Ищем ПДС в initial_capital
                            for (const item of capitalDistribution) {
                                const product = await productRepository.findById(item.product_id);
                                if (product && product.product_type === 'PDS') {
                                    pdsProductId = product.id;
                                    pdsShareInitial = item.share_percent;
                                    break;
                                }
                            }
                            
                            // Ищем ПДС в top_up
                            if (pdsProductId) {
                                const topUpDistribution = profile.top_up || [];
                                for (const item of topUpDistribution) {
                                    if (item.product_id === pdsProductId) {
                                        pdsShareTopUp = item.share_percent;
                                        break;
                                    }
                                }
                                
                                if (pdsShareTopUp === 0 && pdsShareInitial > 0) {
                                    pdsShareTopUp = pdsShareInitial;
                                }
                            }
                            
                            // Если нашли ПДС, рассчитываем эффект софинансирования
                            if (pdsProductId && (pdsShareInitial > 0 || pdsShareTopUp > 0)) {
                                try {
                                    const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;
                                    const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
                                    
                                    pdsCofinancingResult = await pdsCofinancingService.calculateCofinancingEffect({
                                        capitalGap: CapitalGap,
                                        initialReplenishment: recommendedReplenishment,
                                        initialCapital: InitialCapital,
                                        pdsShareInitial: pdsShareInitial,
                                        pdsShareTopUp: pdsShareTopUp,
                                        pdsProductId: pdsProductId,
                                        termMonths: Month,
                                        avgMonthlyIncome: avgMonthlyIncome,
                                        startDate: startDate,
                                        monthlyGrowthRate: m_month_decimal,
                                        portfolioYieldMonthly: d_month_decimal
                                    });
                                    
                                    if (pdsCofinancingResult.pds_applied) {
                                        recommendedReplenishment = pdsCofinancingResult.recommendedReplenishment;
                                    }
                                } catch (pdsError) {
                                    console.error('PDS cofinancing calculation error for passive income:', pdsError);
                                }
                            }
                        }
                    }
                    
                    // Формируем результат
                    const resultItem = {
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'PASSIVE_INCOME',
                        passive_income_calculation: {
                            desired_monthly_income_initial: Math.round(goal.target_amount * 100) / 100,
                            desired_monthly_income_with_inflation: Math.round(desiredMonthlyIncomeWithInflation * 100) / 100,
                            required_capital: Math.round(requiredCapital * 100) / 100,
                            yield_percent: Math.round(yieldPercent * 100) / 100,
                            yield_line: {
                                min_term_months: yieldLine.min_term_months,
                                max_term_months: yieldLine.max_term_months,
                                min_amount: yieldLine.min_amount,
                                max_amount: yieldLine.max_amount
                            }
                        },
                        financials: {
                            cost_initial: Math.round(Cost * 100) / 100,
                            cost_with_inflation: Math.round(CostWithInflation * 100) / 100,
                            inflation_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                            investment_expense_growth_monthly_percent: m_month_percent,
                            investment_expense_growth_annual_percent: Math.round(((Math.pow(1 + m_month_decimal, 12) - 1) * 100) * 100) / 100,
                            initial_capital: InitialCapital,
                            capital_gap: Math.round(CapitalGap * 100) / 100,
                            recommended_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            portfolio_yield_annual_percent: Math.round(d_annual * 100) / 100
                        }
                    };
                    
                    // Добавляем данные по софинансированию ПДС, если применимо
                    if (pdsCofinancingResult && pdsCofinancingResult.pds_applied) {
                        resultItem.pds_cofinancing = {
                            cofinancing_next_year: pdsCofinancingResult.cofinancing_next_year,
                            total_cofinancing_nominal: pdsCofinancingResult.total_cofinancing_nominal,
                            total_cofinancing_with_investment: pdsCofinancingResult.total_cofinancing_with_investment,
                            pds_yield_annual_percent: pdsCofinancingResult.pds_yield_annual_percent,
                            new_capital_gap: pdsCofinancingResult.new_capital_gap,
                            yearly_breakdown: pdsCofinancingResult.yearly_breakdown
                        };
                    }
                    
                    results.push(resultItem);
                    continue; // Пропускаем обычный расчет для PASSIVE_INCOME
                } catch (passiveIncomeError) {
                    console.error('Passive income calculation error:', passiveIncomeError);
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'PASSIVE_INCOME',
                        error: `Passive income calculation failed: ${passiveIncomeError.message || 'Unknown error'}`,
                        error_details: passiveIncomeError
                    });
                    continue;
                }
            }

            // --- Step 1: Find Portfolio (для обычных целей) ---
            const portfolio = await portfolioRepository.findByCriteria({
                classId: goal.goal_type_id,
                amount: goal.target_amount,
                term: goal.term_months
            });

            if (!portfolio) {
                results.push({
                    goal_name: goal.name,
                    error: 'Portfolio not found for specified criteria'
                });
                continue;
            }

            let riskProfiles = portfolio.risk_profiles;
            if (typeof riskProfiles === 'string') {
                try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
            }

            // --- Step 2: Determine Risk Profile & Weighted Yield ---
            const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile);

            if (!profile) {
                results.push({
                    goal_name: goal.name,
                    error: `Risk profile ${goal.risk_profile} not found in portfolio ${portfolio.name}`
                });
                continue;
            }

            // Calculate weighted yield (d)
            let weightedYieldAnnual = 0;
            const productDetails = [];

            const capitalDistribution = profile.initial_capital || [];

            for (const item of capitalDistribution) {
                const product = await productRepository.findById(item.product_id);
                if (!product) continue;
                
                // Логирование для отладки
                console.log('=== PRODUCT DEBUG ===');
                console.log('Product ID:', product.id);
                console.log('Product name:', product.name);
                console.log('Product type:', product.product_type);
                console.log('Product type check (=== "PDS"):', product.product_type === 'PDS');
                console.log('Full product object:', JSON.stringify(product, null, 2));

                // Amount allocated to this product
                const allocatedAmount = (goal.initial_capital || 0) * (item.share_percent / 100);

                // Find matching yield line
                let nominalAmountToCheck = allocatedAmount;
                if (nominalAmountToCheck === 0) nominalAmountToCheck = 1;

                // product.yields содержит массив доходностей с полями:
                // term_from_months, term_to_months, amount_from, amount_to, yield_percent
                const yields = product.yields || [];
                
                if (yields.length === 0) {
                    console.warn(`Product ${product.id} (${product.name}) has no yields configured`);
                }
                
                const line = yields.find(l =>
                    nominalAmountToCheck >= parseFloat(l.amount_from) &&
                    nominalAmountToCheck <= parseFloat(l.amount_to) &&
                    goal.term_months >= l.term_from_months &&
                    goal.term_months <= l.term_to_months
                );

                const effectiveLine = line || yields[0]; // Simplification/Fallback

                const productYield = effectiveLine ? parseFloat(effectiveLine.yield_percent) : 0;

                if (productYield === 0 && yields.length > 0) {
                    console.warn(`Product ${product.id} (${product.name}) yield is 0 or not found for amount ${nominalAmountToCheck} and term ${goal.term_months} months`);
                }

                weightedYieldAnnual += (productYield * (item.share_percent / 100));

                productDetails.push({
                    product_id: product.id,
                    name: product.name,
                    share_percent: item.share_percent,
                    yield_percent: productYield,
                    matched_line: effectiveLine
                });
            }

            const d_annual = weightedYieldAnnual; // d in year percent

            // Проверка: если доходность портфеля равна 0, это может быть проблемой
            if (d_annual === 0 && capitalDistribution.length > 0) {
                console.warn(`Portfolio ${portfolio.name} has zero yield. Products: ${productDetails.map(p => `${p.name} (${p.yield_percent}%)`).join(', ')}`);
            }

            // --- Step 3: Math ---

            const Cost = goal.target_amount;
            const Month = goal.term_months;
            const InitialCapital = goal.initial_capital || 0;

            // Determine Annual Inflation to use
            const inflationAnnualUsed = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;

            // Decimals Conversion

            // d_month (decimal) from Annual
            const d_month_decimal = Math.pow(1 + (d_annual / 100), 1 / 12) - 1;

            // inflation_month (decimal) from Annual
            const infl_month_decimal = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;

            // m_month (decimal) - ALREADY monthly from settings
            const m_month_decimal = m_month_percent / 100;


            // 1. Cost With Inflation
            // CostWithInflation = Cost * (1 + infl)^month
            const CostWithInflation = Cost * Math.pow(1 + infl_month_decimal, Month);

            // 2. Future Value of Initial Capital
            // (InitialCapital * (1 + d_month)^month)
            const FutureValueInitial = InitialCapital * Math.pow(1 + d_month_decimal, Month);

            // 3. Gap (Capital Shortage)
            const CapitalGap = CostWithInflation - FutureValueInitial;

            // 4. Initial Replenishment
            let recommendedReplenishment = 0;

            if (Math.abs(m_month_decimal - d_month_decimal) < 0.0000001) {
                // Zero-denominator-safe approximation
                recommendedReplenishment = CapitalGap / (Month * Math.pow(1 + d_month_decimal, Month - 1));
            } else {
                const numerator = CapitalGap * (m_month_decimal - d_month_decimal);
                const term1 = 1 + d_month_decimal;
                const term2 = Math.pow(1 + m_month_decimal, Month - 1);
                const term3 = Math.pow(1 + d_month_decimal, Month - 1);
                const denominator = term1 * (term2 - term3);

                if (denominator !== 0) {
                    recommendedReplenishment = numerator / denominator;
                }
            }

            // 5. Расчет эффекта софинансирования ПДС (если есть ПДС в портфеле)
            let pdsCofinancingResult = null;
            let pdsProductId = null;
            let pdsShareInitial = 0;
            let pdsShareTopUp = 0;

            // Ищем ПДС в initial_capital
            console.log('=== PDS SEARCH DEBUG ===');
            console.log('capitalDistribution:', JSON.stringify(capitalDistribution, null, 2));
            for (const item of capitalDistribution) {
                const product = await productRepository.findById(item.product_id);
                console.log(`Checking product ID ${item.product_id}:`, {
                    found: !!product,
                    name: product?.name,
                    product_type: product?.product_type,
                    product_type_raw: JSON.stringify(product?.product_type),
                    isPDS: product?.product_type === 'PDS'
                });
                if (product && product.product_type === 'PDS') {
                    pdsProductId = product.id;
                    pdsShareInitial = item.share_percent;
                    console.log('PDS FOUND! ID:', pdsProductId, 'Share:', pdsShareInitial);
                    break;
                }
            }
            console.log('PDS search result - pdsProductId:', pdsProductId, 'pdsShareInitial:', pdsShareInitial);

            // Ищем ПДС в top_up
            if (pdsProductId) {
                const topUpDistribution = profile.top_up || [];
                for (const item of topUpDistribution) {
                    if (item.product_id === pdsProductId) {
                        pdsShareTopUp = item.share_percent;
                        break;
                    }
                }

                // Если в top_up нет ПДС, используем долю из initial_capital
                if (pdsShareTopUp === 0 && pdsShareInitial > 0) {
                    pdsShareTopUp = pdsShareInitial;
                }
            }

            // Если нашли ПДС, рассчитываем эффект софинансирования
            if (pdsProductId && (pdsShareInitial > 0 || pdsShareTopUp > 0)) {
                try {
                    // Получаем доход клиента (из goal, client или 0)
                    const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;
                    
                    // Получаем дату начала (из goal или текущая дата)
                    const startDate = goal.start_date ? new Date(goal.start_date) : new Date();

                    pdsCofinancingResult = await pdsCofinancingService.calculateCofinancingEffect({
                        capitalGap: CapitalGap,
                        initialReplenishment: recommendedReplenishment,
                        initialCapital: InitialCapital,
                        pdsShareInitial: pdsShareInitial,
                        pdsShareTopUp: pdsShareTopUp,
                        pdsProductId: pdsProductId,
                        termMonths: Month,
                        avgMonthlyIncome: avgMonthlyIncome,
                        startDate: startDate,
                        monthlyGrowthRate: m_month_decimal,
                        portfolioYieldMonthly: d_month_decimal
                    });

                    // Обновляем рекомендованное пополнение с учетом софинансирования
                    if (pdsCofinancingResult.pds_applied) {
                        recommendedReplenishment = pdsCofinancingResult.recommendedReplenishment;
                    }
                } catch (pdsError) {
                    console.error('PDS cofinancing calculation error:', pdsError);
                    // Продолжаем с исходным расчетом при ошибке
                }
            }

            const resultItem = {
                goal_id: goal.goal_type_id,
                goal_name: goal.name,
                portfolio: {
                    id: portfolio.id,
                    name: portfolio.name,
                    currency: portfolio.currency
                },
                products: productDetails,
                financials: {
                    cost_initial: Cost,
                    cost_with_inflation: Math.round(CostWithInflation * 100) / 100,
                    inflation_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                    investment_expense_growth_monthly_percent: m_month_percent,
                    // calculated m_annual for reference
                    investment_expense_growth_annual_percent: Math.round(((Math.pow(1 + m_month_decimal, 12) - 1) * 100) * 100) / 100,
                    initial_capital: InitialCapital,
                    capital_gap: Math.round(CapitalGap * 100) / 100,
                    recommended_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                    portfolio_yield_annual_percent: Math.round(d_annual * 100) / 100
                }
            };

            // Добавляем данные по софинансированию ПДС, если применимо
            if (pdsCofinancingResult && pdsCofinancingResult.pds_applied) {
                resultItem.pds_cofinancing = {
                    cofinancing_next_year: pdsCofinancingResult.cofinancing_next_year,
                    total_cofinancing_nominal: pdsCofinancingResult.total_cofinancing_nominal,
                    total_cofinancing_with_investment: pdsCofinancingResult.total_cofinancing_with_investment,
                    pds_yield_annual_percent: pdsCofinancingResult.pds_yield_annual_percent,
                    new_capital_gap: pdsCofinancingResult.new_capital_gap,
                    yearly_breakdown: pdsCofinancingResult.yearly_breakdown
                };
            }

            results.push(resultItem);
        }

        return {
            results: results
        };
    }
}

module.exports = new CalculationService();
