const settingsService = require('./settingsService');
const productRepository = require('../repositories/productRepository');

/**
 * Максимальный срок софинансирования ПДС (лет)
 */
const MAX_COFINANCING_YEARS = 10;

/**
 * Месяц начисления софинансирования (август)
 */
const COFINANCING_MONTH = 8;

class PdsCofinancingService {
    /**
     * Рассчитать эффект софинансирования ПДС
     * 
     * @param {Object} params - Параметры расчета
     * @param {number} params.capitalGap - Нехватка капитала без учета софинансирования
     * @param {number} params.initialReplenishment - Месячное пополнение без учета софинансирования
     * @param {number} params.initialCapital - Начальный капитал клиента
     * @param {number} params.pdsShareInitial - Доля ПДС в начальном капитале (0-100)
     * @param {number} params.pdsShareTopUp - Доля ПДС в пополнениях (0-100)
     * @param {number} params.pdsProductId - ID продукта ПДС
     * @param {number} params.termMonths - Срок цели в месяцах
     * @param {number} params.avgMonthlyIncome - Среднемесячный доход клиента до НДФЛ (₽/мес)
     * @param {Date|string} params.startDate - Дата начала (по умолчанию сегодня)
     * @param {number} params.monthlyGrowthRate - Рост взноса в месяц (десятичная дробь, например 0.0033)
     * @param {number} params.portfolioYieldMonthly - Доходность портфеля в месяц (десятичная дробь) для пересчета пополнения
     * @returns {Promise<Object>} Результат расчета софинансирования
     */
    async calculateCofinancingEffect(params) {
        const {
            capitalGap,
            initialReplenishment,
            initialCapital,
            pdsShareInitial,
            pdsShareTopUp,
            pdsProductId,
            termMonths,
            avgMonthlyIncome,
            startDate = new Date(),
            monthlyGrowthRate,
            portfolioYieldMonthly
        } = params;

        // Если доля ПДС = 0, возвращаем исходные значения
        if (pdsShareTopUp === 0 && pdsShareInitial === 0) {
            return {
                recommendedReplenishment: initialReplenishment,
                cofinancing_next_year: 0,
                total_cofinancing_nominal: 0,
                total_cofinancing_with_investment: 0,
                yearly_breakdown: [],
                pds_applied: false
            };
        }

        // Получаем продукт ПДС
        const pdsProduct = await productRepository.findById(pdsProductId);
        if (!pdsProduct) {
            throw new Error(`PDS product with id ${pdsProductId} not found`);
        }

        // Вычисляем текущий ПДС-капитал (для поиска доходности)
        const pdsInitialCapital = initialCapital * (pdsShareInitial / 100);

        // Находим ставку ПДС из линий продукта
        const pdsYieldAnnual = this._findPdsYield(pdsProduct, pdsInitialCapital, termMonths);
        if (pdsYieldAnnual === null) {
            throw new Error(`PDS yield not found for capital ${pdsInitialCapital} and term ${termMonths} months`);
        }

        // Переводим годовую ставку в месячную
        const pdsYieldMonthly = Math.pow(1 + (pdsYieldAnnual / 100), 1 / 12) - 1;

        // Нормализуем дату начала
        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const startYear = start.getFullYear();
        const startMonth = start.getMonth() + 1; // JavaScript months are 0-based

        // Определяем фактический год начала участия (с учетом взноса или капитала)
        // Если в текущем году (например, 2025) не было ни капитала, ни пополнений (например, декабрь),
        // то первый год участия для 10-летнего лимита будет следующий.
        let cofinancingStartYear = startYear;
        if (pdsInitialCapital <= 0 && startMonth === 12) {
            cofinancingStartYear = startYear + 1;
        }

        // --- FIRST PASS: Estimate total co-financing with initial (dirty) replenishment ---
        // Это нужно, чтобы понять, насколько софинансирование уменьшит общий GAP.
        const firstPass = await this._runSimulation({
            pdsInitialCapital,
            monthlyPdsReplenishment: initialReplenishment * (pdsShareTopUp / 100),
            pdsYieldMonthly,
            termMonths,
            startYear,
            startMonth,
            cofinancingStartYear,
            monthlyGrowthRate,
            avgMonthlyIncome
        });

        // Будущая стоимость софинансирования из первой симуляции
        const totalCofinancingWithInvestment = firstPass.stateCapital;
        const newCapitalGap = capitalGap - totalCofinancingWithInvestment;

        // Пересчет рекомендованного пополнения с новой нехваткой
        let recommendedReplenishment = initialReplenishment;
        if (newCapitalGap > 0 && portfolioYieldMonthly !== undefined) {
            recommendedReplenishment = this._recalculateReplenishment(
                newCapitalGap,
                termMonths,
                monthlyGrowthRate,
                portfolioYieldMonthly
            );
        } else if (newCapitalGap <= 0) {
            recommendedReplenishment = 0;
        }

        // --- SECOND PASS: Final simulation with accurate (clean) replenishment for the breakdown ---
        // Теперь строим таблицу на базе того, что реально будет платить клиент.
        const secondPass = await this._runSimulation({
            pdsInitialCapital,
            monthlyPdsReplenishment: recommendedReplenishment * (pdsShareTopUp / 100),
            pdsYieldMonthly,
            termMonths,
            startYear,
            startMonth,
            cofinancingStartYear,
            monthlyGrowthRate,
            avgMonthlyIncome
        });

        return {
            recommendedReplenishment: Math.round(recommendedReplenishment * 100) / 100,
            cofinancing_next_year: secondPass.cofinancingNextYear,
            total_cofinancing_nominal: Math.round(secondPass.totalCofinNominal * 100) / 100,
            total_cofinancing_with_investment: Math.round(secondPass.stateCapital * 100) / 100,
            yearly_breakdown: secondPass.yearlyData,
            pds_applied: true,
            pds_yield_annual_percent: Math.round(pdsYieldAnnual * 100) / 100,
            new_capital_gap: Math.round(newCapitalGap * 100) / 100
        };
    }

    /**
     * Вспомогательный метод для запуска симуляции накопления ПДС
     * @private
     */
    async _runSimulation(config) {
        const {
            pdsInitialCapital,
            monthlyPdsReplenishment,
            pdsYieldMonthly,
            termMonths,
            startYear,
            startMonth,
            cofinancingStartYear,
            monthlyGrowthRate,
            avgMonthlyIncome
        } = config;

        // Инициализация счетчиков
        let clientCapital = pdsInitialCapital;
        let stateCapital = 0;
        let totalCofinNominal = 0;

        // Трекинг взносов по годам
        const yearlyContributions = {};
        if (pdsInitialCapital > 0) {
            yearlyContributions[startYear] = (yearlyContributions[startYear] || 0) + pdsInitialCapital;
        }

        const yearlyData = [];

        // Взносы начинаются со следующего месяца
        let firstContributionDate = new Date(startYear, startMonth - 1, 1);
        if (startMonth === 12) {
            firstContributionDate.setFullYear(startYear + 1, 0, 1);
        } else {
            firstContributionDate.setMonth(startMonth);
        }

        let currentDate = new Date(firstContributionDate);
        let monthIndex = 0;
        let currentYear = currentDate.getFullYear();

        let capitalAtYearStart = clientCapital + stateCapital;
        let clientContribThisYear = 0;
        let cofinPaidThisYear = 0;

        while (monthIndex < termMonths) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;

            if (year > currentYear && monthIndex > 0) {
                const capitalAtYearEnd = clientCapital + stateCapital;
                const percentageIncome = capitalAtYearEnd - capitalAtYearStart - clientContribThisYear - cofinPaidThisYear;

                let cofinForPrevYear = 0;
                if (yearlyContributions[currentYear] && currentYear - cofinancingStartYear < MAX_COFINANCING_YEARS) {
                    try {
                        const cofinResult = await settingsService.calculatePdsCofinancing(
                            yearlyContributions[currentYear],
                            avgMonthlyIncome
                        );
                        cofinForPrevYear = cofinResult.state_cofin_amount || 0;
                    } catch (e) { }
                }

                yearlyData.push({
                    year: currentYear,
                    capital_start_of_year: Math.round(capitalAtYearStart * 100) / 100,
                    client_contrib_year: Math.round(clientContribThisYear * 100) / 100,
                    cofinancing_earned: cofinForPrevYear, // Заработано за этот год (придет в августе следующего)
                    cofinancing_paid_in_year: Math.round(cofinPaidThisYear * 100) / 100, // Реально зачисленное в этом году
                    capital_end_of_year: Math.round(capitalAtYearEnd * 100) / 100,
                    percentage_income: Math.round(percentageIncome * 100) / 100
                });

                capitalAtYearStart = clientCapital + stateCapital;
                clientContribThisYear = 0;
                cofinPaidThisYear = 0;
                currentYear = year;
            }

            // Начисление процентов
            clientCapital = clientCapital * (1 + pdsYieldMonthly);
            stateCapital = stateCapital * (1 + pdsYieldMonthly);

            // Взнос клиента
            if (monthIndex < termMonths - 1) {
                const monthlyContribution = monthlyPdsReplenishment * Math.pow(1 + monthlyGrowthRate, monthIndex);
                clientCapital += monthlyContribution;
                yearlyContributions[year] = (yearlyContributions[year] || 0) + monthlyContribution;
                clientContribThisYear += monthlyContribution;
            }

            // Начисление софинансирования в августе
            if (month === COFINANCING_MONTH && year > cofinancingStartYear) {
                const prevYear = year - 1;
                if (year - cofinancingStartYear <= MAX_COFINANCING_YEARS && yearlyContributions[prevYear]) {
                    try {
                        const cofinResult = await settingsService.calculatePdsCofinancing(
                            yearlyContributions[prevYear],
                            avgMonthlyIncome
                        );
                        const stateCofinAmount = cofinResult.state_cofin_amount || 0;
                        if (stateCofinAmount > 0) {
                            stateCapital += stateCofinAmount;
                            totalCofinNominal += stateCofinAmount;
                            cofinPaidThisYear += stateCofinAmount;
                        }
                    } catch (e) { }
                }
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
            monthIndex++;
        }

        // Последний год
        const capitalAtYearEnd = clientCapital + stateCapital;
        const percentageIncome = capitalAtYearEnd - capitalAtYearStart - clientContribThisYear - cofinPaidThisYear;
        let cofinForThisYear = 0;
        if (yearlyContributions[currentYear] && currentYear - cofinancingStartYear < MAX_COFINANCING_YEARS) {
            try {
                const cofinResult = await settingsService.calculatePdsCofinancing(
                    yearlyContributions[currentYear],
                    avgMonthlyIncome
                );
                cofinForThisYear = cofinResult.state_cofin_amount || 0;
            } catch (e) { }
        }

        yearlyData.push({
            year: currentYear,
            capital_start_of_year: Math.round(capitalAtYearStart * 100) / 100,
            client_contrib_year: Math.round(clientContribThisYear * 100) / 100,
            cofinancing_earned: cofinForThisYear,
            cofinancing_paid_in_year: Math.round(cofinPaidThisYear * 100) / 100,
            capital_end_of_year: Math.round(capitalAtYearEnd * 100) / 100,
            percentage_income: Math.round(percentageIncome * 100) / 100
        });

        // Софинансирование в следующем году (прогноз за текущий календарный год)
        let cofinancingNextYear = 0;
        if (yearlyContributions[startYear]) {
            try {
                const cofinResult = await settingsService.calculatePdsCofinancing(
                    yearlyContributions[startYear],
                    avgMonthlyIncome
                );
                cofinancingNextYear = cofinResult.state_cofin_amount || 0;
            } catch (e) { }
        }

        return {
            stateCapital,
            totalCofinNominal,
            yearlyData,
            cofinancingNextYear
        };
    }

    /**
     * Найти доходность ПДС из линий продукта
     * @private
     */
    _findPdsYield(pdsProduct, capitalAmount, termMonths) {
        const yields = pdsProduct.yields || [];
        if (yields.length === 0) return null;

        const line = yields.find(l =>
            capitalAmount >= parseFloat(l.amount_from) &&
            capitalAmount <= parseFloat(l.amount_to) &&
            termMonths >= l.term_from_months &&
            termMonths <= l.term_to_months
        );

        const effectiveLine = line || yields[0];
        return effectiveLine ? parseFloat(effectiveLine.yield_percent) : null;
    }

    /**
     * Пересчитать рекомендованное пополнение
     * @private
     */
    _recalculateReplenishment(capitalGap, termMonths, m_month_decimal, d_month_decimal) {
        let recommendedReplenishment = 0;
        if (Math.abs(m_month_decimal - d_month_decimal) < 0.0000001) {
            recommendedReplenishment = capitalGap / (termMonths * Math.pow(1 + d_month_decimal, termMonths - 1));
        } else {
            const numerator = capitalGap * (m_month_decimal - d_month_decimal);
            const term1 = 1 + d_month_decimal;
            const term2 = Math.pow(1 + m_month_decimal, termMonths - 1);
            const term3 = Math.pow(1 + d_month_decimal, termMonths - 1);
            const denominator = term1 * (term2 - term3);
            if (denominator !== 0) {
                recommendedReplenishment = numerator / denominator;
            }
        }
        return recommendedReplenishment;
    }
}

module.exports = new PdsCofinancingService();
