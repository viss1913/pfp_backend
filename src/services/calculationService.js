const portfolioRepository = require('../repositories/portfolioRepository');
const productRepository = require('../repositories/productRepository');
const settingsService = require('./settingsService');
const nsjApiService = require('./nsjApiService');
const pdsCofinancingService = require('./pdsCofinancingService');
const TaxService = require('./TaxService');
const pensionCalculator = require('./calculators/PensionCalculator');
const investmentCalculator = require('./calculators/InvestmentCalculator');
const passiveIncomeCalculator = require('./calculators/PassiveIncomeCalculator');
const lifeInsuranceCalculator = require('./calculators/LifeInsuranceCalculator');
const finReserveCalculator = require('./calculators/FinReserveCalculator');
const otherGoalCalculator = require('./calculators/OtherGoalCalculator');

const CALCULATORS = {
    1: pensionCalculator,     // PENSION
    2: passiveIncomeCalculator, // PASSIVE_INCOME
    3: investmentCalculator,    // INVESTMENT
    4: otherGoalCalculator,    // HOUSE, CAR, etc.
    5: lifeInsuranceCalculator, // LIFE_INSURANCE
    7: finReserveCalculator    // FIN_RESERVE
};

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

        // Вспомогательный расчет ИПК за 1 год при текущем доходе (для оценки будущего и прошлого)
        const avgMonthlyIncome = client.avg_monthly_income || 0;
        const incomeAnnual = avgMonthlyIncome * 12;
        const pensionMaxSalaryLimit = systemSettings.pension_max_salary_limit || 2759000;
        const pensionPfrContributionRatePart1 = systemSettings.pension_pfr_contribution_rate_part1 || 22;

        const baseUsed = Math.min(incomeAnnual, pensionMaxSalaryLimit);
        const contribs = baseUsed * (pensionPfrContributionRatePart1 / 100);
        const maxContribs = pensionMaxSalaryLimit * (pensionPfrContributionRatePart1 / 100);

        // ИПК, зарабатываемый за один год сейчас (максимум 10)
        let ipkYearNow = 0;
        if (maxContribs > 0) {
            ipkYearNow = Math.max(0, Math.min(10, 10 * (contribs / maxContribs)));
        }

        // Накопленный ИПК (до сегодняшнего дня)
        let ipkSoFar = 0;

        if (client.ipk_current !== null && client.ipk_current !== undefined) {
            // Если ИПК передан с фронта (например с Госуслуг), используем его
            ipkSoFar = Number(client.ipk_current);
        } else {
            // Иначе оцениваем прошлое через коэффициент
            const pensionIpkPastCoef = systemSettings.pension_ipk_past_coef || 0.6;
            const avgIpkPast = ipkYearNow * pensionIpkPastCoef;
            ipkSoFar = avgIpkPast * yearsOfWork;
        }

        // Будущий ИПК (от сегодня до пенсии)
        // Предполагаем сохранение текущего уровня дохода (в реальном выражении)
        const ipkFuture = ipkYearNow * yearsToPension;

        // Итоговый прогнозный ИПК
        const ipkEst = ipkSoFar + ipkFuture;

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

    _getPriority(goal) {
        // 1: Reservoir/Emergency
        // 2: Pension (id 1)
        // 3: Passive Income (id 2) / Life (id 5)
        // 4: Investment (id 3) / Other
        const name = (goal.name || '').toUpperCase();
        // Keep name check for backward compatibility or explicit "Reservation" naming
        if (name.includes('РЕЗЕРВ') || name.includes('RESERVOIR')) return 1;

        const map = {
            7: 1, // FinReserve
            1: 2, // Pension
            2: 3, // Passive Income
            5: 3  // Life
        };
        return map[goal.goal_type_id] || 4;
    }


    async _prepareContext(clientData) {
        // Collect assets and pool
        let poolBalance = Number(clientData.total_liquid_capital || 0);
        const assets = clientData.assets || [];

        // Chronological list of shared pool events (unlock_month: 0 is current liquid)
        const sharedPoolEvents = assets
            .filter(a => !a.goal_id)
            .map(a => ({
                month: a.unlock_month || a.sell_month || 0,
                amount: Number(a.amount || a.current_value || 0)
            }))
            .sort((a, b) => a.month - b.month);

        // Add initial liquid to the start
        sharedPoolEvents.unshift({ month: 0, amount: poolBalance });

        // Fetch System Settings
        const settings = {};
        const allSettingsKeys = [
            'investment_expense_growth_monthly',
            'inflation_rate_year',
            'pension_pfr_contribution_rate_part1',
            'pension_fixed_payment',
            'pension_point_cost',
            'pension_max_salary_limit',
            'pension_ipk_past_coef'
        ];

        for (const key of allSettingsKeys) {
            try {
                const s = await settingsService.get(key);
                settings[key] = s ? s.value : null;
            } catch (e) {
                console.warn(`Could not fetch setting ${key}`);
            }
        }

        const m_month_percent = settings.investment_expense_growth_monthly || 0.0;
        const db_inflation_year_percent = settings.inflation_rate_year || 4.0;

        return {
            poolBalance,
            sharedPoolEvents,
            usedCofinancingPerYear: {},
            usedTaxBasePerYear: {},
            inflationYear: db_inflation_year_percent,
            replenishmentIndexationRate: m_month_percent,
            client: clientData,
            assets: assets,
            settings: settings,
            services: {
                settingsService,
                nsjApiService,
                pdsCofinancingService,
                TaxService
            },
            repositories: {
                portfolioRepository,
                productRepository
            }
        };
    }

    /**
     * Perform First Run calculation for a client request
     * @param {Object} data - CalculationRequest data
     */
    async calculateFirstRun(data) {
        const { goals, client } = data;
        const clientData = client || {};

        // 1. Prepare Shared Context
        const context = await this._prepareContext(clientData);

        // 2. Sort goals by Priority
        const indexedGoals = (goals || []).map((g, i) => ({ goal: g, index: i }))
            .sort((a, b) => {
                const pA = a.goal.priority || this._getPriority(a.goal);
                const pB = b.goal.priority || this._getPriority(b.goal);
                if (pA !== pB) return pA - pB;
                return (a.goal.term_months || 0) - (b.goal.term_months || 0);
            });

        const resultsIndexed = [];

        // 3. Main Loop
        for (const { goal, index } of indexedGoals) {
            const typeId = goal.goal_type_id;
            const CalculatorClass = CALCULATORS[typeId] || otherGoalCalculator;

            try {
                // Initialize calculator if it's a class, or use as object
                const calculator = (typeof CalculatorClass === 'function') ? new CalculatorClass() : CalculatorClass;

                const result = await calculator.calculate(goal, context);
                resultsIndexed.push({ index, result });
            } catch (err) {
                console.error(`Calculation error for goal ${goal.name}:`, err);
                resultsIndexed.push({
                    index,
                    result: {
                        goal_id: goal.goal_type_id,
                        goal_name: goal.name,
                        error: err.message
                    }
                });
            }
        }

        // 4. Aggregate Results
        const results = resultsIndexed
            .sort((a, b) => a.index - b.index)
            .map(item => item.result);

        return {
            summary: {
                goals_count: goals.length,
                total_capital: results.reduce((sum, r) => sum + (r.summary?.total_capital_at_end || 0), 0),
                total_state_benefit: results.reduce((sum, r) => sum + (r.summary?.state_benefit || 0), 0)
            },
            goals: results
        };
    }
}

module.exports = new CalculationService();
