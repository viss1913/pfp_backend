const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');

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

            // Если это цель типа LIFE, вызываем API НСЖ
            if (isLifeGoal) {
                try {
                    const nsjResult = await nsjApiService.calculateLifeInsurance({
                        target_amount: goal.target_amount,
                        term_months: goal.term_months,
                        client: client || {},
                        payment_variant: goal.payment_variant || 0, // По умолчанию единовременно
                        program: goal.program || 'base'
                    });
                    
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'LIFE',
                        nsj_calculation: {
                            success: nsjResult.success,
                            term_years: nsjResult.term,
                            risks: nsjResult.risks || [],
                            total_premium: nsjResult.total_premium,
                            total_limit: nsjResult.total_limit,
                            payments_list: nsjResult.payments_list || [],
                            warnings: nsjResult.warnings || [],
                            calculation_date: nsjResult.calculation_date
                        }
                    });
                    continue; // Пропускаем обычный расчет для LIFE
                } catch (nsjError) {
                    console.error('NSJ API Error for goal:', goal.name, nsjError);
                    results.push({
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        goal_type: 'LIFE',
                        error: `NSJ calculation failed: ${nsjError.message || 'Unknown error'}`,
                        nsj_error_details: nsjError.errors || nsjError.warnings || []
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

                // Amount allocated to this product
                const allocatedAmount = (goal.initial_capital || 0) * (item.share_percent / 100);

                // Find matching line
                let nominalAmountToCheck = allocatedAmount;
                if (nominalAmountToCheck === 0) nominalAmountToCheck = 1;

                const line = product.lines.find(l =>
                    nominalAmountToCheck >= l.min_amount &&
                    nominalAmountToCheck <= l.max_amount &&
                    goal.term_months >= l.min_term_months &&
                    goal.term_months <= l.max_term_months
                );

                const effectiveLine = line || product.lines[0]; // Simplification/Fallback

                const productYield = effectiveLine ? effectiveLine.yield_percent : 0;

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

            results.push({
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
            });
        }

        return {
            results: results
        };
    }
}

module.exports = new CalculationService();
