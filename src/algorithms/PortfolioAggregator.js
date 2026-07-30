const productRepository = require('../repositories/productRepository');
const { normalizeSberLifeProgramLabel } = require('./calculators/sberLifeProgramLabel');

class PortfolioAggregator {
    /**
     * Агрегирует результаты расчета по всем целям в единый портфель
     * @param {Array} results - Список результатов расчета целей
     * @param {Object} context - Контекст расчета (projectId и т.д.)
     */
    async aggregate(results, context) {
        const { projectId } = context;
        const assetsMap = {};
        const flowsMap = {};
        let totalInitial = 0;
        let totalMonthly = 0;

        results.forEach(res => {
            if (!res.details) return;

            // Специальная обработка для целей LIFE (НСЖ/ИСЖ)
            if (res.goal_type === 'LIFE' || res.goal_id === 5) {
                const rawName = res.details.program_name || res.goal_name || 'Страхование жизни';
                const programName = /подушка|подписке|сбер\s*страхование/i.test(String(rawName))
                    ? normalizeSberLifeProgramLabel(rawName)
                    : rawName;
                const yieldP = res.summary?.investment_yield_percent || 0;

                // Активы (Первоначальный капитал)
                const initialCap = res.summary?.initial_capital || 0;
                if (initialCap > 0) {
                    if (!assetsMap[programName]) assetsMap[programName] = { amount: 0, weightedYieldSum: 0 };
                    assetsMap[programName].amount += initialCap;
                    assetsMap[programName].weightedYieldSum += (initialCap * yieldP);
                    totalInitial += initialCap;
                }

                // Потоки (Регулярные взносы) — актуарный месяц, не year/12
                const monthlyFromSummary = Number(res.summary?.monthly_replenishment);
                const monthlyFromNsj = Number(res.details?.monthly_premium);
                const annualPrem = Number(res.details?.annual_premium) || 0;
                const monthlyAmount = Number.isFinite(monthlyFromSummary) && monthlyFromSummary > 0
                    ? monthlyFromSummary
                    : (Number.isFinite(monthlyFromNsj) && monthlyFromNsj > 0
                        ? monthlyFromNsj
                        : (annualPrem > 0 ? annualPrem / 12 : 0));
                if (monthlyAmount > 0) {
                    const freq = res.summary?.premium_frequency || 'monthly';
                    if (!flowsMap[programName]) flowsMap[programName] = { amount: 0, weightedYieldSum: 0, payment_frequency: freq };
                    flowsMap[programName].amount += monthlyAmount;
                    flowsMap[programName].weightedYieldSum += (monthlyAmount * yieldP);
                    totalMonthly += monthlyAmount;
                }
                return;
            }

            // Стандартные инструменты
            const initialInstrs = this._getInitialInstruments(res);
            const monthlyInstrs = this._getMonthlyInstruments(res);

            initialInstrs.forEach(inst => {
                const name = inst.name || 'Unknown';
                const amt = inst.amount || 0;
                const y = inst.yield || 0;
                if (!assetsMap[name]) {
                    assetsMap[name] = {
                        amount: 0,
                        weightedYieldSum: 0,
                        product_type: null,
                        product_id: null,
                        resolut_pfp_code: null
                    };
                }
                const pt = inst.product_type != null ? String(inst.product_type).toUpperCase().trim() : '';
                if (pt && !assetsMap[name].product_type) assetsMap[name].product_type = pt;
                if (inst.product_id != null && assetsMap[name].product_id == null) {
                    assetsMap[name].product_id = inst.product_id;
                }
                if (inst.resolut_pfp_code && !assetsMap[name].resolut_pfp_code) {
                    assetsMap[name].resolut_pfp_code = inst.resolut_pfp_code;
                }
                assetsMap[name].amount += amt;
                assetsMap[name].weightedYieldSum += (amt * y);
                totalInitial += amt;
            });

            monthlyInstrs.forEach(inst => {
                const name = inst.name || 'Unknown';
                const amt = inst.amount || 0;
                const y = inst.yield || 0;
                const freq = inst.payment_frequency || 'monthly';
                if (!flowsMap[name]) {
                    flowsMap[name] = {
                        amount: 0,
                        weightedYieldSum: 0,
                        payment_frequency: freq,
                        product_type: null,
                        product_id: null,
                        resolut_pfp_code: null
                    };
                }
                const pt = inst.product_type != null ? String(inst.product_type).toUpperCase().trim() : '';
                if (pt && !flowsMap[name].product_type) flowsMap[name].product_type = pt;
                if (inst.product_id != null && flowsMap[name].product_id == null) {
                    flowsMap[name].product_id = inst.product_id;
                }
                if (inst.resolut_pfp_code && !flowsMap[name].resolut_pfp_code) {
                    flowsMap[name].resolut_pfp_code = inst.resolut_pfp_code;
                }
                flowsMap[name].amount += amt;
                flowsMap[name].weightedYieldSum += (amt * y);
                if (freq !== 'monthly' && flowsMap[name].payment_frequency === 'monthly') {
                    flowsMap[name].payment_frequency = freq;
                }
                totalMonthly += amt;
            });
        });

        // Расчет доходностей (включая short_term_yield за 6 месяцев по СУММАРНОМУ объему)
        const assetsAllocation = await this._mapAllocation(assetsMap, totalInitial, projectId);
        const cashFlowAllocation = await this._mapAllocation(flowsMap, totalMonthly, projectId);

        return {
            total_initial_capital: Math.round(totalInitial * 100) / 100,
            total_monthly_replenishment: Math.round(totalMonthly * 100) / 100,
            assets_allocation: assetsAllocation.sort((a, b) => b.amount - a.amount),
            cash_flow_allocation: cashFlowAllocation.sort((a, b) => b.amount - a.amount)
        };
    }

    async _mapAllocation(map, total, projectId) {
        const list = [];
        for (const name in map) {
            const data = map[name];
            if (data.amount <= 0) continue;

            const avgYield = data.weightedYieldSum / data.amount;

            // Расчитываем short_term_yield за 6 месяцев по суммарному объему + тип продукта из БД
            let shortTermYield = avgYield;
            let productType = data.product_type || null;
            let productIdOut = data.product_id != null ? data.product_id : null;
            let resolutPfpCodeOut = data.resolut_pfp_code || null;
            try {
                const product = await productRepository.findByName(name, projectId);
                if (product) {
                    const pt = (product.product_type || '').toUpperCase().trim();
                    if (pt) productType = pt;
                    if (productIdOut == null) productIdOut = Number(product.id);
                    if (!resolutPfpCodeOut && product.resolut_pfp_code) {
                        const t = String(product.resolut_pfp_code).trim();
                        resolutPfpCodeOut = t || null;
                    }
                    if (product.yields && product.yields.length > 0) {
                        const TERM = 6;
                        const amount = data.amount;
                        const row = product.yields.find(l =>
                            TERM >= l.term_from_months &&
                            TERM <= l.term_to_months &&
                            amount >= parseFloat(l.amount_from) &&
                            amount <= parseFloat(l.amount_to)
                        ) || product.yields.reduce((min, l) =>
                            (parseFloat(l.term_to_months) || 999) < (parseFloat(min.term_to_months) || 999) ? l : min
                            , product.yields[0]);

                        if (row) shortTermYield = parseFloat(row.yield_percent);
                    }
                }
            } catch (e) {
                console.error(`[PortfolioAggregator] Error fetching yield for ${name}:`, e.message);
            }

            list.push({
                name,
                amount: Math.round(data.amount * 100) / 100,
                share: total > 0 ? Math.round((data.amount / total) * 100) : 0,
                yield: Math.round(avgYield * 100) / 100,
                short_term_yield: Math.round(shortTermYield * 100) / 100,
                payment_frequency: data.payment_frequency,
                product_type: productType || null,
                product_id: productIdOut,
                resolut_pfp_code: resolutPfpCodeOut,
            });
        }
        return list;
    }

    _getInitialInstruments(res) {
        if (res.details.portfolio_structure && Array.isArray(res.details.portfolio_structure.initial_instruments)) {
            return res.details.portfolio_structure.initial_instruments;
        }
        if (res.details.initial_capital_instruments) return res.details.initial_capital_instruments;
        if (res.details.initial_instruments) return res.details.initial_instruments;

        const goalInitial = res.summary?.initial_capital || 0;
        const insts = res.details.instruments || (res.details.portfolio && res.details.portfolio.instruments) || [];
        if (Array.isArray(insts)) {
            return insts.map(i => ({
                ...i,
                amount: (i.amount !== undefined) ? i.amount : (goalInitial * (i.share / 100))
            }));
        }
        return [];
    }

    _getMonthlyInstruments(res) {
        if (res.details.portfolio_structure && Array.isArray(res.details.portfolio_structure.monthly_instruments)) {
            return res.details.portfolio_structure.monthly_instruments;
        }
        if (res.details.monthly_savings_instruments) return res.details.monthly_savings_instruments;
        if (res.details.monthly_instruments) return res.details.monthly_instruments;

        const goalMonthly = res.summary?.monthly_replenishment || 0;
        if (goalMonthly > 0) {
            const insts = res.details.instruments || [];
            if (Array.isArray(insts)) {
                return insts.map(i => ({
                    ...i,
                    amount: goalMonthly * (i.share / 100)
                }));
            }
        }
        return [];
    }
}

module.exports = new PortfolioAggregator();
