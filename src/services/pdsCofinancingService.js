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

        // Вычисляем текущий ПДС-капитал
        const pdsInitialCapital = initialCapital * (pdsShareInitial / 100);
        
        // Вычисляем месячное пополнение в ПДС
        const monthlyPdsReplenishment = initialReplenishment * (pdsShareTopUp / 100);

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

        // Инициализация счетчиков
        let clientCapital = pdsInitialCapital; // Капитал клиента (начальный + взносы + проценты)
        let stateCapital = 0; // Капитал от софинансирования (государство + проценты)
        let totalCofinNominal = 0; // Номинальное софинансирование (без процентов)

        // Трекинг взносов по годам для расчета софинансирования
        const yearlyContributions = {}; // { year: сумма_взносов_за_год }

        // Массив данных по годам
        const yearlyData = [];

        // Моделирование по месяцам
        let currentDate = new Date(start);
        let monthIndex = 0;
        let currentYear = startYear;
        let currentMonth = startMonth;
        let capitalAtYearStart = clientCapital + stateCapital;
        let clientContribThisYear = 0;
        let cofinPaidThisYear = 0; // Софинансирование, реально зачисленное в этом году

        while (monthIndex < termMonths) {
            const isLastMonth = monthIndex === termMonths - 1;
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;

            // Если начался новый год (январь), сохраняем данные за прошлый год
            if (year > currentYear && monthIndex > 0) {
                // Сохраняем данные за прошлый год (currentYear)
                const capitalAtYearEnd = clientCapital + stateCapital;
                const percentageIncome = capitalAtYearEnd - capitalAtYearStart - clientContribThisYear - cofinPaidThisYear;
                
                // Софинансирование, рассчитанное по взносам прошлого года (будет начислено в августе текущего года)
                let cofinForPrevYear = 0;
                if (yearlyContributions[currentYear] && currentYear - startYear < MAX_COFINANCING_YEARS) {
                    try {
                        const cofinResult = await settingsService.calculatePdsCofinancing(
                            yearlyContributions[currentYear],
                            avgMonthlyIncome
                        );
                        cofinForPrevYear = cofinResult.state_cofin_amount || 0;
                    } catch (e) {
                        console.warn(`Failed to calculate cofinancing for year ${currentYear}:`, e.message);
                    }
                }

                yearlyData.push({
                    year: currentYear,
                    capital_start_of_year: Math.round(capitalAtYearStart * 100) / 100,
                    client_contrib_year: Math.round(clientContribThisYear * 100) / 100,
                    cofinancing_for_year: cofinForPrevYear, // Рассчитанное по взносам этого года (будет начислено в августе следующего)
                    cofinancing_paid_in_year: Math.round(cofinPaidThisYear * 100) / 100, // Реально зачисленное в этом году (за прошлый год)
                    capital_end_of_year: Math.round(capitalAtYearEnd * 100) / 100,
                    percentage_income: Math.round(percentageIncome * 100) / 100
                });

                // Сброс для нового года
                capitalAtYearStart = clientCapital + stateCapital;
                clientContribThisYear = 0;
                cofinPaidThisYear = 0;
                currentYear = year;
            }

            // 1. Начисление процентов
            clientCapital = clientCapital * (1 + pdsYieldMonthly);
            stateCapital = stateCapital * (1 + pdsYieldMonthly);

            // 2. Взнос клиента (если не последний месяц)
            if (!isLastMonth) {
                const monthlyContribution = monthlyPdsReplenishment * Math.pow(1 + monthlyGrowthRate, monthIndex);
                clientCapital += monthlyContribution;
                
                // Добавляем к взносам текущего года
                if (!yearlyContributions[year]) {
                    yearlyContributions[year] = 0;
                }
                yearlyContributions[year] += monthlyContribution;
                clientContribThisYear += monthlyContribution;
            }

            // 3. Начисление софинансирования в августе за прошлый год
            if (month === COFINANCING_MONTH && year > startYear) {
                const prevYear = year - 1;
                const yearsOfParticipation = year - startYear;

                // Проверяем ограничение 10 лет
                if (yearsOfParticipation <= MAX_COFINANCING_YEARS && yearlyContributions[prevYear]) {
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
                    } catch (e) {
                        console.warn(`Failed to calculate cofinancing for year ${prevYear}:`, e.message);
                    }
                }
            }

            // Переход к следующему месяцу
            currentDate.setMonth(currentDate.getMonth() + 1);
            monthIndex++;
        }

        // Сохраняем данные за последний год (если еще не сохранены)
        if (monthIndex > 0 && (yearlyData.length === 0 || yearlyData[yearlyData.length - 1].year !== currentYear)) {
            const capitalAtYearEnd = clientCapital + stateCapital;
            const percentageIncome = capitalAtYearEnd - capitalAtYearStart - clientContribThisYear - cofinPaidThisYear;
            
            // Софинансирование, рассчитанное по взносам этого года (будет начислено в августе следующего года)
            let cofinForThisYear = 0;
            if (yearlyContributions[currentYear] && currentYear - startYear < MAX_COFINANCING_YEARS) {
                try {
                    const cofinResult = await settingsService.calculatePdsCofinancing(
                        yearlyContributions[currentYear],
                        avgMonthlyIncome
                    );
                    cofinForThisYear = cofinResult.state_cofin_amount || 0;
                } catch (e) {
                    console.warn(`Failed to calculate cofinancing for year ${currentYear}:`, e.message);
                }
            }

            yearlyData.push({
                year: currentYear,
                capital_start_of_year: Math.round(capitalAtYearStart * 100) / 100,
                client_contrib_year: Math.round(clientContribThisYear * 100) / 100,
                cofinancing_for_year: cofinForThisYear, // Рассчитанное по взносам этого года
                cofinancing_paid_in_year: Math.round(cofinPaidThisYear * 100) / 100, // Реально зачисленное в этом году
                capital_end_of_year: Math.round(capitalAtYearEnd * 100) / 100,
                percentage_income: Math.round(percentageIncome * 100) / 100
            });
        }

        // Софинансирование в следующем году (за первый год участия)
        let cofinancingNextYear = 0;
        const firstYear = startYear;
        if (yearlyContributions[firstYear] && termMonths >= 12) {
            try {
                const cofinResult = await settingsService.calculatePdsCofinancing(
                    yearlyContributions[firstYear],
                    avgMonthlyIncome
                );
                cofinancingNextYear = cofinResult.state_cofin_amount || 0;
            } catch (e) {
                console.warn(`Failed to calculate cofinancing for first year:`, e.message);
            }
        }

        // Будущая стоимость софинансирования
        const totalCofinancingWithInvestment = stateCapital;

        // Корректировка нехватки капитала
        const newCapitalGap = capitalGap - totalCofinancingWithInvestment;

        // Пересчет рекомендованного пополнения с новой нехваткой
        // Используем доходность портфеля (не только ПДС), так как пополнение идет во весь портфель
        let newRecommendedReplenishment = initialReplenishment;
        if (newCapitalGap > 0 && portfolioYieldMonthly !== undefined) {
            // Используем ту же формулу, что и в основном расчете
            newRecommendedReplenishment = this._recalculateReplenishment(
                newCapitalGap,
                termMonths,
                monthlyGrowthRate,
                portfolioYieldMonthly
            );
        } else if (newCapitalGap <= 0) {
            // Если нехватка перекрыта, минимизируем пополнение
            newRecommendedReplenishment = 0; // TODO: можно добавить минимальный технический взнос
        }

        return {
            recommendedReplenishment: Math.round(newRecommendedReplenishment * 100) / 100,
            cofinancing_next_year: cofinancingNextYear,
            total_cofinancing_nominal: Math.round(totalCofinNominal * 100) / 100,
            total_cofinancing_with_investment: Math.round(totalCofinancingWithInvestment * 100) / 100,
            yearly_breakdown: yearlyData,
            pds_applied: true,
            pds_yield_annual_percent: Math.round(pdsYieldAnnual * 100) / 100,
            new_capital_gap: Math.round(newCapitalGap * 100) / 100
        };
    }

    /**
     * Найти доходность ПДС из линий продукта
     * @private
     */
    _findPdsYield(pdsProduct, capitalAmount, termMonths) {
        const yields = pdsProduct.yields || [];
        if (yields.length === 0) {
            return null;
        }

        // Ищем подходящую линию доходности
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
     * Пересчитать рекомендованное пополнение с учетом новой нехватки капитала
     * Использует ту же формулу, что и основной расчет
     * @private
     */
    _recalculateReplenishment(capitalGap, termMonths, m_month_decimal, d_month_decimal) {
        // Формула из основного расчета
        let recommendedReplenishment = 0;

        if (Math.abs(m_month_decimal - d_month_decimal) < 0.0000001) {
            // Zero-denominator-safe approximation
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

