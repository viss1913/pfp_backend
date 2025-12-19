const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');
const pdsCofinancingService = require('./pdsCofinancingService');

class CalculationService {
    /**
     * Рассчитать прогнозную государственную пенсию
     * @param {Object} client - Данные клиента (ClientData)
     * @param {Object} systemSettings - Системные настройки пенсии
     * @param {Date} nowDate - Текущая дата
     * @returns {Object} Результат расчета госпенсии
     */
    async calculateStatePension(client, systemSettings, nowDate) {
        // 1. Возраст и стаж
        const currentYear = nowDate.getFullYear();
        const birthDate = new Date(client.birth_date);
        const birthYear = birthDate.getFullYear();
        const age = currentYear - birthYear;
        const yearsOfWork = Math.max(age - 18, 0); // Допущение: работа началась в 18 лет

        // 2. Пенсионный возраст и год выхода
        const sex = client.sex || '';
        const isMale = sex === 'male' || sex === 'M' || sex === 'мужской';
        const retirementAge = isMale ? 65 : 60;
        const retirementYear = birthYear + retirementAge;
        const yearsToPension = Math.max(retirementYear - currentYear, 0);

        // 3. Оценка ИПК
        let ipkEst = 0;

        if (client.ipk_current !== null && client.ipk_current !== undefined) {
            // Если ИПК передан с фронта, используем его
            ipkEst = Number(client.ipk_current);
        } else {
            // Иначе оцениваем ИПК на основе дохода
            const avgMonthlyIncome = client.avg_monthly_income || 0;
            const incomeAnnual = avgMonthlyIncome * 12;
            const pensionMaxSalaryLimit = systemSettings.pension_max_salary_limit || 2759000;
            const pensionPfrContributionRatePart1 = systemSettings.pension_pfr_contribution_rate_part1 || 22;

            const baseUsed = Math.min(incomeAnnual, pensionMaxSalaryLimit);
            const contribs = baseUsed * (pensionPfrContributionRatePart1 / 100);
            const maxContribs = pensionMaxSalaryLimit * (pensionPfrContributionRatePart1 / 100);

            // ИПК за текущий год: 10 * (contribs / maxContribs) с ограничением [0;10]
            const ipkYearNow = Math.max(0, Math.min(10, 10 * (contribs / maxContribs)));

            // Коэффициент для прошлых лет
            const pensionIpkPastCoef = systemSettings.pension_ipk_past_coef || 0.6;
            const avgIpkPast = ipkYearNow * pensionIpkPastCoef;

            // Общий ИПК = средний ИПК за прошлые годы * количество лет работы
            ipkEst = avgIpkPast * yearsOfWork;
        }

        // 4. Индексация фиксированной выплаты и стоимости балла до выхода на пенсию
        const inflationRate = systemSettings.inflation_rate || 4.0;
        const pensionPointCost = systemSettings.pension_point_cost || 145.69;
        const pensionFixedPayment = systemSettings.pension_fixed_payment || 8907;

        const pensionPointCostFuture = pensionPointCost * Math.pow(1 + (inflationRate / 100), yearsToPension);
        const pensionFixedPaymentFuture = pensionFixedPayment * Math.pow(1 + (inflationRate / 100), yearsToPension);

        // 5. Прогнозная госпенсия на год выхода (в ценах того года)
        const statePensionMonthlyFuture = ipkEst * pensionPointCostFuture + pensionFixedPaymentFuture;

        return {
            ipk_est: Math.round(ipkEst * 100) / 100,
            state_pension_monthly_future: Math.round(statePensionMonthlyFuture * 100) / 100,
            state_pension_monthly_current: Math.round(statePensionMonthlyFuture / Math.pow(1 + (inflationRate / 100), yearsToPension) * 100) / 100, // В ценах сегодня
            retirement_age: retirementAge,
            retirement_year: retirementYear,
            years_to_pension: yearsToPension,
            years_of_work: yearsOfWork,
            age: age
        };
    }

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
            // ---------------------------------------------------------
            // 1. DETERMINE GOAL TYPE
            // ---------------------------------------------------------

            // PENSION (id=1)
            const isPensionGoal = goal.goal_type_id === 1 || (goal.name && goal.name.toUpperCase().includes('ПЕНСИЯ'));

            // PASSIVE_INCOME (id=2) - "Рантье"
            const isPassiveIncomeGoal = goal.goal_type_id === 2 || (goal.name && goal.name.toUpperCase().includes('РАНТЬЕ'));

            // INVESTMENT (id=3) - "Накопление" / "Приумножение" / "INVESTMENT"
            const isInvestmentGoal = goal.goal_type_id === 3 || goal.name === 'Приумножение капитала' || (goal.type && goal.type.toUpperCase() === 'INVESTMENT');

            // LIFE (id=5) - "Жизнь" / NSJ
            const isLifeGoal = goal.goal_type_id === 5 || goal.name === 'Жизнь';

            // If checking explicitly by ID, ensure we don't double match if IDs overlap with names logic unexpectedly.
            // Prioritize ID checks if validation confirms IDs.

            // ... (Dispatch logic) ...

            // Если это цель типа INVESTMENT / CAPITAL
            if (isInvestmentGoal) {
                console.log('=== INVESTMENT CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);

                try {
                    // 1. ПАРАМЕТРЫ
                    const initialCapital = goal.initial_capital || 0;
                    const monthlyReplenishment = goal.monthly_replenishment || 0; // Using specific field if available, or assume passed in another way?
                    // Usually 'target_amount' is present, but here we calculate Result. 
                    // However, 'monthly_replenishment' might be passed as 'initial_replenishment' or user might provide it in 'goal.monthly_replenishment'.
                    // If not present, we can't calculate accumulation properly unless we assume 0.
                    // Let's assume input has 'monthly_replenishment'.
                    const replenishment = goal.monthly_replenishment || goal.replenishment_amount || 0;

                    const termMonths = goal.term_months || 120; // Default 10 years if missing
                    const inflationRate = goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent;
                    const inflationMonthly = Math.pow(1 + (inflationRate / 100), 1 / 12) - 1;

                    // 2. ИЩЕМ ПОРТФЕЛЬ
                    const portfolio = await portfolioRepository.findByCriteria({
                        classId: 3, // Assuming ID 3 for Investment/Capital based on heuristic
                        amount: initialCapital,
                        term: termMonths
                    });

                    if (!portfolio) {
                        throw new Error(`No portfolio found for Investment calculation (Class ID 3, Amount ${initialCapital}, Term ${termMonths})`);
                    }

                    // 3. СЧИТАЕМ ДОХОДНОСТЬ ПОРТФЕЛЯ (Взвешенная)
                    let riskProfiles = typeof portfolio.risk_profiles === 'string'
                        ? JSON.parse(portfolio.risk_profiles)
                        : portfolio.risk_profiles;

                    const profile = riskProfiles.find(p => p.profile_type === (goal.risk_profile || 'BALANCED'));

                    if (!profile) {
                        throw new Error(`Risk profile ${goal.risk_profile} not found in portfolio ${portfolio.name}`);
                    }

                    // Calculate Weighted Yield AND Build Composition
                    let weightedYieldAnnual = 0;

                    // Prepare Composition arrays
                    const initialCapitalComposition = [];
                    const topUpComposition = [];

                    // --- INITIAL CAPITAL ALLOCATION ---
                    let instruments = profile.initial_capital || [];
                    if (!instruments.length && profile.instruments) {
                        instruments = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                    }

                    // We declare capitalDistribution here for clarity and use in top-up fallback
                    const capitalDistribution = instruments;

                    for (const item of capitalDistribution) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        const amountForProduct = Math.max(initialCapital * (item.share_percent / 100), 1);

                        const yields = product.yields || [];
                        const line = yields.find(l =>
                            termMonths >= l.term_from_months &&
                            termMonths <= l.term_to_months &&
                            amountForProduct >= parseFloat(l.amount_from) &&
                            amountForProduct <= parseFloat(l.amount_to)
                        ) || yields.find(l =>
                            termMonths >= l.term_from_months &&
                            termMonths <= l.term_to_months
                        ) || yields[0];

                        const pYield = line ? parseFloat(line.yield_percent) : 0;
                        weightedYieldAnnual += pYield * (item.share_percent / 100);

                        initialCapitalComposition.push({
                            product_id: product.id,
                            product_name: product.name,
                            product_type: product.product_type,
                            share_percent: item.share_percent,
                            amount: Math.round(amountForProduct * 100) / 100,
                            yield_percent: pYield
                        });
                    }

                    console.log(`Weighted Annual Yield: ${weightedYieldAnnual}%`);

                    // --- TOP-UP ALLOCATION (for Composition display) ---
                    let topUpInstrumentsForComposition = profile.top_up || [];
                    if (!topUpInstrumentsForComposition.length && profile.instruments) {
                        topUpInstrumentsForComposition = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                    }
                    // Fallback to initial structure if top-up not defined (often they are same)
                    // But we need to build the composition array
                    if (!topUpInstrumentsForComposition.length && instruments.length > 0) {
                        // If no explicit top-up, usually it follows initial capital OR it might be empty?
                        // In our logic, if topUp is empty, we might not be replenishing into specific products?
                        // Actually, accumulation logic assumes "weightedYieldAnnual" applies to EVERYTHING.
                        // So implicit assumption implies TopUp structure == Initial Structure if not defined.
                        // Let's mirror initial for display if empty, or map explicit.
                        topUpInstrumentsForComposition = instruments; // Fallback for display
                    }

                    for (const item of topUpInstrumentsForComposition) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        // Yield for TopUp might be different due to smaller amounts per month?
                        // BUT for simplicity in "Weighted Yield" calculation above, we used Initial Capital amounts.
                        // Strictly speaking, we should re-calculate weighted yield for TopUps if amounts differ drastically and hit different yield lines.
                        // For MVP/V1, we use the same Portfolio Yield.
                        // Here we just record metadata.
                        const pYield = weightedYieldAnnual; // Simplified for display, or fetch precise? Let's leave undefined or portfolio avg for now to avoid confusion.

                        topUpComposition.push({
                            product_id: product.id,
                            product_name: product.name,
                            product_type: product.product_type,
                            share_percent: item.share_percent,
                            amount: Math.round((replenishment * (item.share_percent / 100)) * 100) / 100,
                            yield_percent: null // Not strictly calculated per line
                        });
                    }

                    // 4. НАКОПЛЕНИЕ (Собственный капитал + Проценты)
                    const yieldMonthly = Math.pow(1 + (weightedYieldAnnual / 100), 1 / 12) - 1;
                    const mgmtFeeMonthly = m_month_percent / 100; // Investment expense
                    const effectiveYieldMonthly = yieldMonthly; // - mgmtFeeMonthly (if we want to subtract fee, but usually fee is on AUM or similar. User logic "m_month_percent" used in PassiveIncome seems to suggest expense GROWTH? Or check passive income logic: term2 = (1 + m_month_decimal)... term1 = 1 + d_month_decimal.
                    // In passive income:
                    // numerator = Gap * (m_mont - d_mont)
                    // It seems m_month_percent IS NOT a fee, but "Indexation of Replenishment" or similar?
                    // Wait, lines 90-97: "Investment Expense Growth". This implies the EXPENSE grows?
                    // Ah, in Passive Income calc: "investment_expense_growth_monthly".
                    // Let's stick to simple logic: Input Inflation is for replenishment indexation.

                    let accumulatedOwnCapital = initialCapital;
                    let totalOwnContributions = initialCapital;
                    let currentReplenishment = replenishment;

                    const yearlyBreakdownOwn = [];

                    for (let m = 1; m <= termMonths; m++) {
                        // 1. Accrue Interest
                        accumulatedOwnCapital *= (1 + effectiveYieldMonthly);

                        // 2. Add Replenishment
                        accumulatedOwnCapital += currentReplenishment;
                        totalOwnContributions += currentReplenishment;

                        // 3. Index Replenishment (Monthly per instruction "для простоты")
                        currentReplenishment *= (1 + inflationMonthly);

                        if (m % 12 === 0) {
                            yearlyBreakdownOwn.push({
                                year: Math.ceil(m / 12),
                                accumulated_capital: accumulatedOwnCapital,
                                total_contributions: totalOwnContributions
                            });
                        }
                    }

                    // 5. ПДС (Софинансирование)
                    let pdsResult = null;
                    let pdsShareInitial = 0;
                    let pdsShareTopUp = 0;
                    let pdsProductId = null;

                    // Find PDS share
                    for (const item of instruments) {
                        const product = await productRepository.findById(item.product_id);
                        if (product && product.product_type === 'PDS') {
                            pdsProductId = product.id;
                            pdsShareInitial = item.share_percent;
                            break;
                        }
                    }
                    // Find Top Up share (assuming structure similar to PassiveIncome check)
                    let topUpInstruments = profile.top_up || [];
                    if (!topUpInstruments.length && profile.instruments) {
                        topUpInstruments = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                    }
                    for (const item of topUpInstruments) {
                        if (item.product_id === pdsProductId) {
                            pdsShareTopUp = item.share_percent;
                            break;
                        }
                    }
                    if (!pdsShareTopUp && pdsShareInitial) pdsShareTopUp = pdsShareInitial; // Fallback

                    if (pdsProductId) {
                        const avgMonthlyIncome = goal.avg_monthly_income || (client && client.avg_monthly_income) || 0;
                        const startDate = goal.start_date ? new Date(goal.start_date) : new Date();

                        // Use service to calculate State Capital accumulation
                        // We use the "Gap" service but ignore gap-specific returns, looking only at 'total_cofinancing_with_investment'
                        // and 'yearly_breakdown'.
                        // We pass 'replenishment' as 'initialReplenishment'.
                        // 'capitalGap' irrelevant -> pass 0 or a dummy big number, it returns total cofinancing anyway.

                        pdsResult = await pdsCofinancingService.calculateCofinancingEffect({
                            capitalGap: 0,
                            initialReplenishment: replenishment,
                            initialCapital: initialCapital,
                            pdsShareInitial: pdsShareInitial,
                            pdsShareTopUp: pdsShareTopUp,
                            pdsProductId: pdsProductId,
                            termMonths: termMonths,
                            avgMonthlyIncome: avgMonthlyIncome,
                            startDate: startDate,
                            monthlyGrowthRate: inflationMonthly, // Indexation
                            portfolioYieldMonthly: yieldMonthly
                        });
                    }

                    const totalStateCapital = pdsResult ? pdsResult.total_cofinancing_with_investment : 0;
                    const totalCapital = accumulatedOwnCapital + totalStateCapital;

                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'INVESTMENT',
                        investment_calculation: {
                            initial_capital: initialCapital,
                            monthly_replenishment_start: replenishment,
                            term_months: termMonths,
                            portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100,
                            inflation_rate_annual: inflationRate,

                            total_capital: Math.round(totalCapital * 100) / 100,
                            total_own_capital: Math.round(accumulatedOwnCapital * 100) / 100,
                            total_state_capital: Math.round(totalStateCapital * 100) / 100,
                            total_own_contributions: Math.round(totalOwnContributions * 100) / 100,

                            yearly_breakdown_own: yearlyBreakdownOwn
                        },
                        pds_cofinancing: pdsResult ? {
                            cofinancing_next_year: pdsResult.cofinancing_next_year,
                            total_cofinancing_nominal: pdsResult.total_cofinancing_nominal,
                            total_cofinancing_with_investment: pdsResult.total_cofinancing_with_investment,
                            pds_yield_annual_percent: pdsResult.pds_yield_annual_percent,
                            yearly_breakdown: pdsResult.yearly_breakdown
                        } : null,

                        // --- NEW: Unified Summary & Detail Blocks ---
                        summary: {
                            goal_type: 'INVESTMENT',
                            status: 'OK',
                            initial_capital: initialCapital,
                            initial_capital: initialCapital,
                            monthly_replenishment: replenishment,
                            monthly_replenishment_without_pds: replenishment, // Since PDS is additive here, not reductive, maybe same? 
                            // Wait, for Investment, PDS *adds* to capital, but "replenishment" is input. 
                            // The user asked "without PDS to compare". But here replenishment is INPUT. 
                            // So "without PDS" is just replenishment. 
                            // For Passive Income/Pension, replenishment is *calculated*.
                            // Let's keep it consistent. If input is fixed, "without PDS" is same.
                            total_capital_at_end: Math.round(totalCapital * 100) / 100,
                            target_achieved: true, // Investment is always achieved (accumulation)
                            projected_value: Math.round(totalCapital * 100) / 100,
                            state_benefit: Math.round(totalStateCapital * 100) / 100 // Explicit "Bonus" from state
                        },
                        portfolio_structure: {
                            risk_profile: goal.risk_profile || 'BALANCED',
                            portfolio_yield_annual: Math.round(weightedYieldAnnual * 100) / 100,
                            inflation_rate_used: inflationRate,
                            portfolio_composition: {
                                initial_capital_allocation: initialCapitalComposition,
                                monthly_topup_allocation: topUpComposition
                            }
                        }
                    });

                    continue;

                } catch (err) {
                    console.error('Investment calculation error:', err);
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'INVESTMENT',
                        error: err.message
                    });
                    continue;
                }
            }

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
                    let nsjResult;
                    try {
                        nsjResult = await nsjApiService.calculateLifeInsurance(nsjParams);
                    } catch (e) {
                        // Fallback logic or rethrow if strictly required, but existing logic catches below
                        throw e;
                    }
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
                        amount: goal.initial_capital || 0, // Используем первоначальный капитал для выбора портфеля
                        term: goal.term_months
                    });

                    let pdsCofinancingResult = null;
                    const initialCapitalComposition = [];
                    const topUpComposition = [];
                    let pdsProductId = null;
                    let pdsShareInitial = 0;
                    let pdsShareTopUp = 0;

                    if (portfolio) {
                        let riskProfiles = portfolio.risk_profiles;
                        if (typeof riskProfiles === 'string') {
                            try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
                        }

                        const profile = riskProfiles.find(p => p.profile_type === (goal.risk_profile || 'BALANCED'));
                        let recommendedReplenishmentRaw = 0; // Pre-initialize to avoid TDZ shadowing issues

                        if (!profile) {
                            results.push({
                                goal_id: goal.goal_type_id,
                                goal_name: goal.name,
                                goal_type: 'PASSIVE_INCOME',
                                error: `Risk profile ${goal.risk_profile || 'BALANCED'} not found in portfolio ${portfolio.name}`
                            });
                            continue;
                        }

                        let capitalDistribution = []; // Move out and initialize to avoid TDZ

                        capitalDistribution = profile.initial_capital || [];
                        pdsProductId = null;
                        pdsShareInitial = 0;
                        pdsShareTopUp = 0;

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

                        }

                        // --- BUILD ALLOCATION ARRAYS FOR COMPOSITION (Unified API) ---
                        // (Use existing initialCapitalComposition and topUpComposition declared at lines 574-575)

                        // Support legacy and new structure for initial
                        let instruments = capitalDistribution;
                        if (!instruments.length && profile.instruments) {
                            instruments = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                        }

                        // To match Investment logic, we need to fetch all products in composition
                        // We might have already fetched some for PDS check, but let's iterate to build full list
                        for (const item of instruments) {
                            const product = await productRepository.findById(item.product_id);
                            if (!product) continue;
                            const amountForProduct = Math.max(InitialCapital * (item.share_percent / 100), 1);

                            // Simplified Yield fetch for display - matching PDS logic somewhat or just getting product lines
                            // For Passive Income we currently use Global Yield Line setting, but composition should show product yields if possible?
                            // "Weighted Yield" is not strictly used in Passive Income calc (it uses the Yield curve setting),
                            // BUT the Portfolio Composition should reflect what sits inside.
                            const yields = product.yields || [];
                            const line = yields.find(l =>
                                Month >= l.term_from_months &&
                                Month <= l.term_to_months &&
                                amountForProduct >= parseFloat(l.amount_from) &&
                                amountForProduct <= parseFloat(l.amount_to)
                            ) || yields[0];

                            initialCapitalComposition.push({
                                product_id: product.id,
                                product_name: product.name,
                                product_type: product.product_type,
                                share_percent: item.share_percent,
                                amount: Math.round(amountForProduct * 100) / 100,
                                yield_percent: line ? parseFloat(line.yield_percent) : 0
                            });
                        }


                        // TopUp Allocation calculation will be done AFTER recommendedReplenishment is finalized
                        // (after PDS adjustment)



                        // Capture Raw Replenishment BEFORE PDS adjustment
                        // Сохраняем «сырое» пополнение до учета софинансирования ПДС,
                        // чтобы вернуть оба значения (с ПДС и без ПДС)
                        recommendedReplenishmentRaw = recommendedReplenishment;

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


                        // --- FINAL TOP-UP COMPOSITION BUILD ---
                        // Now that recommendedReplenishment is finalized (potentially reduced by PDS), we build the composition
                        let topUpDist = profile.top_up || [];
                        if (!topUpDist.length && profile.instruments) {
                            topUpDist = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                        }
                        if (!topUpDist.length && capitalDistribution.length > 0) topUpDist = capitalDistribution; // Fallback

                        for (const item of topUpDist) {
                            const product = await productRepository.findById(item.product_id);
                            if (!product) continue;
                            topUpComposition.push({
                                product_id: product.id,
                                product_name: product.name,
                                product_type: product.product_type,
                                share_percent: item.share_percent,
                                amount: Math.round((recommendedReplenishment * (item.share_percent / 100)) * 100) / 100,
                                yield_percent: null
                            });
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
                        },
                        // --- UNIFIED BLOCKS ---
                        summary: {
                            goal_type: 'PASSIVE_INCOME',
                            status: CapitalGap > 0 ? 'GAP' : 'OK',
                            initial_capital: InitialCapital,
                            initial_capital: InitialCapital,
                            monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                            // For Passive Income, "Total Capital" is "Required Capital" to generate income
                            total_capital_at_end: Math.round(requiredCapital * 100) / 100,
                            target_achieved: CapitalGap <= 0,
                            projected_value: Math.round(desiredMonthlyIncomeWithInflation * 100) / 100, // Monthly income
                            // If PDS applied, we can show state contribution benefit to gap? 
                            // Currently PDS logic "covers" gap by reducing replenishment.
                            // State benefit in accumulated capital can be inferred from Total Cofinancing.
                            state_benefit: (pdsCofinancingResult && pdsCofinancingResult.pds_applied)
                                ? Math.round(pdsCofinancingResult.total_cofinancing_with_investment * 100) / 100
                                : 0
                        },
                        portfolio_structure: {
                            risk_profile: goal.risk_profile || 'BALANCED',
                            portfolio_yield_annual: Math.round(d_annual * 100) / 100,
                            inflation_rate_used: inflationAnnualUsed,
                            portfolio_composition: {
                                initial_capital_allocation: portfolio ? initialCapitalComposition : [],
                                monthly_topup_allocation: portfolio ? topUpComposition : []
                            }
                        }
                    };

                    // Add PDS data if available
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
                    continue;
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

            // Если это цель типа PENSION, используем специальную логику расчета
            if (isPensionGoal) {
                console.log('=== PENSION CALCULATION START ===');
                console.log('Goal:', goal.name, 'Goal ID:', goal.goal_type_id);
                console.log('Target monthly pension:', goal.target_amount, 'Term months:', goal.term_months);

                try {
                    // Проверяем наличие необходимых данных клиента
                    if (!client || !client.birth_date) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            error: 'Client birth_date is required for pension calculation'
                        });
                        continue;
                    }

                    // Получаем системные настройки пенсии
                    const pensionSettings = {
                        pension_pfr_contribution_rate_part1: 22,
                        pension_fixed_payment: 8907,
                        pension_point_cost: 145.69,
                        pension_max_salary_limit: 2759000,
                        pension_ipk_past_coef: 0.6,
                        inflation_rate: goal.inflation_rate !== undefined ? Number(goal.inflation_rate) : db_inflation_year_percent
                    };

                    try {
                        const settingPfr1 = await settingsService.get('pension_pfr_contribution_rate_part1');
                        if (settingPfr1) pensionSettings.pension_pfr_contribution_rate_part1 = settingPfr1.value;
                    } catch (e) { console.warn('Could not fetch pension_pfr_contribution_rate_part1'); }

                    try {
                        const settingFixed = await settingsService.get('pension_fixed_payment');
                        if (settingFixed) pensionSettings.pension_fixed_payment = settingFixed.value;
                    } catch (e) { console.warn('Could not fetch pension_fixed_payment'); }

                    try {
                        const settingPoint = await settingsService.get('pension_point_cost');
                        if (settingPoint) pensionSettings.pension_point_cost = settingPoint.value;
                    } catch (e) { console.warn('Could not fetch pension_point_cost'); }

                    try {
                        const settingMax = await settingsService.get('pension_max_salary_limit');
                        if (settingMax) pensionSettings.pension_max_salary_limit = settingMax.value;
                    } catch (e) { console.warn('Could not fetch pension_max_salary_limit'); }

                    try {
                        const settingCoef = await settingsService.get('pension_ipk_past_coef');
                        if (settingCoef) pensionSettings.pension_ipk_past_coef = settingCoef.value;
                    } catch (e) { console.warn('Could not fetch pension_ipk_past_coef'); }

                    // Получаем avg_monthly_income из client (приоритет) или goal
                    const clientWithIncome = {
                        ...client,
                        avg_monthly_income: client.avg_monthly_income || goal.avg_monthly_income || 0
                    };

                    // Рассчитываем прогнозную госпенсию
                    const nowDate = new Date();
                    const statePensionResult = await this.calculateStatePension(clientWithIncome, pensionSettings, nowDate);

                    console.log('State pension calculation result:', statePensionResult);

                    // Определяем срок до пенсии: если term_months не задан или 0, используем years_to_pension * 12
                    const termMonthsForCalculation = (goal.term_months && goal.term_months > 0)
                        ? goal.term_months
                        : statePensionResult.years_to_pension * 12;

                    // Рассчитываем желаемую пенсию в будущем (с учетом инфляции)
                    // Используем years_to_pension для индексации, так как это срок до выхода на пенсию
                    const inflationAnnualUsed = pensionSettings.inflation_rate;
                    const infl_month_decimal = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;
                    const monthsToPension = statePensionResult.years_to_pension * 12;
                    const desiredPensionMonthlyFuture = goal.target_amount * Math.pow(1 + infl_month_decimal, monthsToPension);

                    // Дефицит пенсии
                    const pensionGapMonthlyFuture = Math.max(desiredPensionMonthlyFuture - statePensionResult.state_pension_monthly_future, 0);

                    console.log('Desired pension (initial):', goal.target_amount);
                    console.log('Desired pension (with inflation):', desiredPensionMonthlyFuture);
                    console.log('State pension (future):', statePensionResult.state_pension_monthly_future);
                    console.log('Pension gap (future):', pensionGapMonthlyFuture);

                    // Если дефицита нет, возвращаем результат без расчета капитала
                    if (pensionGapMonthlyFuture <= 0) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            state_pension: {
                                ipk_est: statePensionResult.ipk_est,
                                state_pension_monthly_future: statePensionResult.state_pension_monthly_future,
                                state_pension_monthly_current: statePensionResult.state_pension_monthly_current,
                                retirement_age: statePensionResult.retirement_age,
                                retirement_year: statePensionResult.retirement_year,
                                years_to_pension: statePensionResult.years_to_pension
                            },
                            desired_pension: {
                                desired_monthly_income_initial: Math.round(goal.target_amount * 100) / 100,
                                desired_monthly_income_with_inflation: Math.round(desiredPensionMonthlyFuture * 100) / 100
                            },
                            pension_gap: {
                                gap_monthly_future: 0,
                                has_gap: false
                            },
                            message: 'Госпенсия покрывает желаемую пенсию, дополнительный капитал не требуется'
                        });
                        continue;
                    }

                    // Если есть дефицит, рассчитываем через PASSIVE_INCOME логику
                    // Приводим дефицит в ценах сегодня (дисконтируем)
                    const pensionGapMonthlyCurrent = pensionGapMonthlyFuture / Math.pow(1 + (inflationAnnualUsed / 100), statePensionResult.years_to_pension);

                    // Создаем виртуальную цель пассивного дохода
                    const virtualPassiveIncomeGoal = {
                        goal_type_id: 1, // Используем портфель класса "пенсия" (id=1)
                        name: 'Пенсия (дефицит)',
                        target_amount: pensionGapMonthlyCurrent, // Желаемый доход в месяц (в ценах сегодня)
                        term_months: statePensionResult.years_to_pension * 12, // Срок до выхода на пенсию
                        risk_profile: goal.risk_profile,
                        initial_capital: goal.initial_capital || 0,
                        inflation_rate: inflationAnnualUsed,
                        avg_monthly_income: clientWithIncome.avg_monthly_income,
                        start_date: goal.start_date
                    };

                    console.log('Virtual passive income goal for pension gap:', virtualPassiveIncomeGoal);

                    // Используем логику PASSIVE_INCOME для расчета дефицита
                    const infl_month_decimal_pi = Math.pow(1 + (inflationAnnualUsed / 100), 1 / 12) - 1;
                    const desiredMonthlyIncomeWithInflation = virtualPassiveIncomeGoal.target_amount * Math.pow(1 + infl_month_decimal_pi, virtualPassiveIncomeGoal.term_months);

                    // 1. РАСЧЕТ ЦЕЛЕВОГО КАПИТАЛА (Payout Phase)
                    // Для этого используем настройки доходности "Пассивного дохода" (глобальные)
                    // Потому что мы считаем, какой капитал нам нужен, чтобы жить на проценты
                    const payoutYieldLine = await settingsService.findPassiveIncomeYieldLine(0, virtualPassiveIncomeGoal.term_months, true);

                    if (!payoutYieldLine) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            error: `No passive income yield line found for term ${virtualPassiveIncomeGoal.term_months} months to calculate required capital`
                        });
                        continue;
                    }

                    const payoutYieldPercent = parseFloat(payoutYieldLine.yield_percent);

                    // Расчет необходимого капитала: (MonthlyIncome * 12 * 100) / PayoutYield
                    const requiredCapital = (desiredMonthlyIncomeWithInflation * 12 * 100) / payoutYieldPercent;

                    console.log('Pension Payout Calc:', {
                        desiredMonthlyIncomeWithInflation,
                        payoutYieldPercent,
                        requiredCapital
                    });


                    // 2. РАСЧЕТ НАКОПЛЕНИЯ (Accumulation Phase)
                    // Для этого ищем портфель "Пенсия" и считаем доходность его продуктов
                    const portfolioForAcc = await portfolioRepository.findByCriteria({
                        classId: 1,
                        amount: goal.initial_capital || 0,
                        term: virtualPassiveIncomeGoal.term_months
                    });

                    if (!portfolioForAcc) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            error: `No portfolio found (Class 1) to determine accumulation yield`
                        });
                        continue;
                    }

                    // Получаем доходность из риск-профиля портфеля
                    let riskProfilesYield = portfolioForAcc.risk_profiles;
                    if (typeof riskProfilesYield === 'string') {
                        try { riskProfilesYield = JSON.parse(riskProfilesYield); } catch (e) { riskProfilesYield = []; }
                    }
                    const profileYield = riskProfilesYield.find(p => p.profile_type === goal.risk_profile);

                    if (!profileYield) {
                        results.push({
                            goal_id: goal.goal_type_id,
                            goal_name: goal.name,
                            goal_type: 'PENSION',
                            error: `Risk profile ${goal.risk_profile} not found in pension portfolio`
                        });
                        continue;
                    }

                    // Считаем средневзвешенную доходность портфеля (для накопления)
                    let weightedYieldAnnual = 0;

                    // Support both legacy (initial_capital) and new (instruments) formats
                    let capitalDistributionYield = profileYield.initial_capital;
                    if (!capitalDistributionYield && profileYield.instruments) {
                        capitalDistributionYield = profileYield.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                    }
                    capitalDistributionYield = capitalDistributionYield || [];

                    for (const item of capitalDistributionYield) {
                        const product = await productRepository.findById(item.product_id);
                        if (!product) continue;

                        // Calculate allocated amount for this product
                        const initialCap = goal.initial_capital || 0;
                        let allocatedAmount = initialCap * (item.share_percent / 100);
                        if (allocatedAmount === 0) allocatedAmount = 1;

                        const yields = product.yields || [];

                        // Find line matching BOTH Term AND Amount
                        const line = yields.find(l =>
                            virtualPassiveIncomeGoal.term_months >= l.term_from_months &&
                            virtualPassiveIncomeGoal.term_months <= l.term_to_months &&
                            allocatedAmount >= parseFloat(l.amount_from) &&
                            allocatedAmount <= parseFloat(l.amount_to)
                        );

                        const effectiveLine = line || yields.find(l =>
                            virtualPassiveIncomeGoal.term_months >= l.term_from_months &&
                            virtualPassiveIncomeGoal.term_months <= l.term_to_months
                        ) || yields[0];

                        const productYield = effectiveLine ? parseFloat(effectiveLine.yield_percent) : 0;

                        weightedYieldAnnual += (productYield * (item.share_percent / 100));
                    }

                    const accumulationYieldPercent = weightedYieldAnnual;

                    console.log('Pension Accumulation Calc:', {
                        accumulationYieldPercent,
                        initial_capital: goal.initial_capital
                    });

                    // 3. МАТЕМАТИКА
                    const Cost = requiredCapital;
                    const CostWithInflation = requiredCapital;
                    const Month = virtualPassiveIncomeGoal.term_months;
                    const InitialCapital = virtualPassiveIncomeGoal.initial_capital || 0;

                    // Используем доходность ПОРТФЕЛЯ для роста накоплений
                    const d_annual = accumulationYieldPercent;
                    const d_month_decimal = Math.pow(1 + (d_annual / 100), 1 / 12) - 1;
                    const m_month_decimal = m_month_percent / 100;

                    const FutureValueInitial = InitialCapital * Math.pow(1 + d_month_decimal, Month);
                    const CapitalGap = CostWithInflation - FutureValueInitial;

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

                    const recommendedReplenishmentRaw = recommendedReplenishment;

                    // Используем тот же портфель для проверки ПДС
                    const portfolio = portfolioForAcc;


                    let pdsCofinancingResult = null;
                    const initialCapitalComposition = [];
                    const topUpComposition = [];

                    if (portfolio) {
                        let riskProfiles = portfolio.risk_profiles;
                        if (typeof riskProfiles === 'string') {
                            try { riskProfiles = JSON.parse(riskProfiles); } catch (e) { riskProfiles = []; }
                        }

                        const profile = riskProfiles.find(p => p.profile_type === goal.risk_profile);

                        if (profile) {
                            // Support both legacy and new formats
                            let capitalDistribution = profile.initial_capital;
                            if (!capitalDistribution && profile.instruments) {
                                capitalDistribution = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
                            }
                            capitalDistribution = capitalDistribution || [];

                            let pdsProductId = null;
                            let pdsShareInitial = 0;
                            let pdsShareTopUp = 0;



                            for (const item of capitalDistribution) {
                                const product = await productRepository.findById(item.product_id);
                                if (!product) continue;

                                // Check for PDS
                                if (product.product_type === 'PDS') {
                                    pdsProductId = product.id;
                                    pdsShareInitial = item.share_percent;
                                }

                                // Build Composition
                                const amountForProduct = Math.max(InitialCapital * (item.share_percent / 100), 1);
                                const yields = product.yields || [];
                                const line = yields.find(l =>
                                    Month >= l.term_from_months &&
                                    Month <= l.term_to_months &&
                                    amountForProduct >= parseFloat(l.amount_from) &&
                                    amountForProduct <= parseFloat(l.amount_to)
                                ) || yields[0];

                                initialCapitalComposition.push({
                                    product_id: product.id,
                                    product_name: product.name,
                                    product_type: product.product_type,
                                    share_percent: item.share_percent,
                                    amount: Math.round(amountForProduct * 100) / 100,
                                    yield_percent: line ? parseFloat(line.yield_percent) : 0
                                });
                            }

                            if (pdsProductId) {
                                // Build TopUp Composition
                                let topUpDistForComp = profile.top_up;
                                if (!topUpDistForComp && profile.instruments) {
                                    topUpDistForComp = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                                }
                                if ((!topUpDistForComp || !topUpDistForComp.length) && (capitalDistribution && capitalDistribution.length > 0)) {
                                    topUpDistForComp = capitalDistribution; // Fallback
                                }
                                topUpDistForComp = topUpDistForComp || [];

                                for (const item of topUpDistForComp) {
                                    const product = await productRepository.findById(item.product_id);
                                    if (!product) continue;
                                    // Check if this is PDS to set share
                                    if (item.product_id === pdsProductId) {
                                        pdsShareTopUp = item.share_percent;
                                    }

                                    topUpComposition.push({
                                        product_id: product.id,
                                        product_name: product.name,
                                        product_type: product.product_type,
                                        share_percent: item.share_percent,
                                        amount: Math.round((recommendedReplenishment * (item.share_percent / 100)) * 100) / 100,
                                        yield_percent: null
                                    });
                                }

                                if (pdsShareTopUp === 0 && pdsShareInitial > 0) {
                                    pdsShareTopUp = pdsShareInitial;
                                }
                            }


                            if (pdsProductId && (pdsShareInitial > 0 || pdsShareTopUp > 0)) {
                                try {
                                    const avgMonthlyIncome = clientWithIncome.avg_monthly_income || 0;
                                    const startDate = virtualPassiveIncomeGoal.start_date ? new Date(virtualPassiveIncomeGoal.start_date) : new Date();

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
                                    console.error('PDS cofinancing calculation error for pension:', pdsError);
                                }
                            }
                        }
                    }

                    // Формируем результат для цели "Пенсия"
                    const resultItem = {
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'PENSION',
                        state_pension: {
                            ipk_est: statePensionResult.ipk_est,
                            state_pension_monthly_future: statePensionResult.state_pension_monthly_future,
                            state_pension_monthly_current: statePensionResult.state_pension_monthly_current,
                            retirement_age: statePensionResult.retirement_age,
                            retirement_year: statePensionResult.retirement_year,
                            years_to_pension: statePensionResult.years_to_pension,
                            years_of_work: statePensionResult.years_of_work,
                            age: statePensionResult.age
                        },
                        desired_pension: {
                            desired_monthly_income_initial: Math.round(goal.target_amount * 100) / 100,
                            desired_monthly_income_with_inflation: Math.round(desiredPensionMonthlyFuture * 100) / 100
                        },
                        pension_gap: {
                            gap_monthly_future: Math.round(pensionGapMonthlyFuture * 100) / 100,
                            gap_monthly_current: Math.round(pensionGapMonthlyCurrent * 100) / 100,
                            has_gap: true
                        },
                        passive_income_calculation: {
                            desired_monthly_income_initial: Math.round(pensionGapMonthlyCurrent * 100) / 100,
                            desired_monthly_income_with_inflation: Math.round(desiredMonthlyIncomeWithInflation * 100) / 100,
                            required_capital: Math.round(requiredCapital * 100) / 100,
                            yield_percent: Math.round(payoutYieldPercent * 100) / 100
                            // yield_line removed as we use portfolio average yield
                        },
                        financials: {
                            cost_initial: Math.round(Cost * 100) / 100,
                            cost_with_inflation: Math.round(CostWithInflation * 100) / 100,
                            inflation_annual_percent: Math.round(inflationAnnualUsed * 100) / 100,
                            investment_expense_growth_monthly_percent: m_month_percent,
                            investment_expense_growth_annual_percent: Math.round(((Math.pow(1 + m_month_decimal, 12) - 1) * 100) * 100) / 100,
                            initial_capital: InitialCapital,
                            capital_gap: Math.round(CapitalGap * 100) / 100,
                            // with/without PDS replenishments
                            recommended_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            recommended_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                        },
                        // --- UNIFIED BLOCKS ---
                        summary: {
                            goal_type: 'PENSION',
                            status: CapitalGap > 0 ? 'GAP' : 'OK',
                            initial_capital: InitialCapital,
                            monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                            monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                            total_capital_at_end: Math.round(CostWithInflation * 100) / 100, // Capital needed at retirement
                            target_achieved: true, // Assuming recommendations are followed
                            projected_value: Math.round(desiredPensionMonthlyFuture * 100) / 100, // Monthly Pension
                            state_benefit: (pdsCofinancingResult && pdsCofinancingResult.pds_applied)
                                ? Math.round(pdsCofinancingResult.total_cofinancing_with_investment * 100) / 100
                                : 0
                        },
                        portfolio_structure: {
                            risk_profile: goal.risk_profile || 'BALANCED',
                            portfolio_yield_annual: Math.round(d_annual * 100) / 100,
                            inflation_rate_used: inflationAnnualUsed,
                            portfolio_composition: {
                                initial_capital_allocation: initialCapitalComposition,
                                monthly_topup_allocation: topUpComposition
                            }
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
                    continue; // Пропускаем обычный расчет для PENSION
                } catch (pensionError) {
                    console.error('Pension calculation error:', pensionError);
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'PENSION',
                        error: `Pension calculation failed: ${pensionError.message || 'Unknown error'}`,
                        error_details: pensionError
                    });
                    continue;
                }
            }

            // --- Step 1: Find Portfolio (для обычных целей) ---
            const portfolio = await portfolioRepository.findByCriteria({
                classId: goal.goal_type_id,
                amount: goal.initial_capital || 0, // Используем первоначальный капитал для выбора портфеля
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
            const initialCapitalComposition = [];
            const topUpComposition = [];

            // Support both legacy (initial_capital) and new (instruments) formats
            let capitalDistribution = profile.initial_capital;
            if (!capitalDistribution && profile.instruments) {
                capitalDistribution = profile.instruments.filter(i => i.bucket_type === 'INITIAL_CAPITAL');
            }
            capitalDistribution = capitalDistribution || [];

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

                initialCapitalComposition.push({
                    product_id: product.id,
                    product_name: product.name,
                    product_type: product.product_type,
                    share_percent: item.share_percent,
                    amount: Math.round(allocatedAmount * 100) / 100,
                    yield_percent: productYield
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

            const recommendedReplenishmentRaw = recommendedReplenishment;

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
                let topUpDistribution = profile.top_up;
                if (!topUpDistribution && profile.instruments) {
                    topUpDistribution = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
                }
                topUpDistribution = topUpDistribution || [];

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

            // Build TopUp Composition (after recommendedReplenishment is calculated)
            let topUpDistForComp = profile.top_up;
            if (!topUpDistForComp && profile.instruments) {
                topUpDistForComp = profile.instruments.filter(i => i.bucket_type === 'TOP_UP');
            }
            if ((!topUpDistForComp || !topUpDistForComp.length) && capitalDistribution.length > 0) {
                topUpDistForComp = capitalDistribution; // Fallback
            }
            topUpDistForComp = topUpDistForComp || [];

            for (const item of topUpDistForComp) {
                const product = await productRepository.findById(item.product_id);
                if (!product) continue;
                topUpComposition.push({
                    product_id: product.id,
                    product_name: product.name,
                    product_type: product.product_type,
                    share_percent: item.share_percent,
                    amount: Math.round((recommendedReplenishment || 0) * (item.share_percent / 100) * 100) / 100,
                    yield_percent: null
                });
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
                },
                // --- UNIFIED BLOCKS ---
                summary: {
                    goal_type: 'OTHER', // Or generic? Let's use OTHER for now to signify fallback
                    status: CapitalGap > 0 ? 'GAP' : 'OK',
                    initial_capital: InitialCapital,
                    initial_capital: InitialCapital,
                    monthly_replenishment: Math.round(recommendedReplenishment * 100) / 100,
                    monthly_replenishment_without_pds: Math.round(recommendedReplenishmentRaw * 100) / 100,
                    total_capital_at_end: Math.round(CostWithInflation * 100) / 100,
                    target_achieved: true,
                    projected_value: Math.round(FutureValueInitial * 100) / 100, // Roughly, actually we want end capital
                    state_benefit: (pdsCofinancingResult && pdsCofinancingResult.pds_applied)
                        ? Math.round(pdsCofinancingResult.total_cofinancing_with_investment * 100) / 100
                        : 0
                },
                portfolio_structure: {
                    risk_profile: goal.risk_profile || 'BALANCED',
                    portfolio_yield_annual: Math.round(d_annual * 100) / 100,
                    inflation_rate_used: inflationAnnualUsed,
                    portfolio_composition: {
                        initial_capital_allocation: initialCapitalComposition,
                        monthly_topup_allocation: topUpComposition
                    }
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
