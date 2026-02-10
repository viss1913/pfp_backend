const clientService = require('./clientService');
const aiService = require('./aiService');
const calculationService = require('./calculationService');

class ReportService {
    async getClientReportData(clientId) {
        // 1. Fetch Client Data
        const client = await clientService.getFullClient(clientId);
        if (!client) throw new Error('Client not found');

        // 2. Use stored snapshot (goals_summary) for 100% consistency with Dashboard
        let calculationResult = null;
        let isFromSnapshot = false;

        if (client.goals_summary) {
            try {
                const stored = typeof client.goals_summary === 'string'
                    ? JSON.parse(client.goals_summary)
                    : client.goals_summary;

                // The snapshot might be the full result { client_id, client_profile, calculation }
                // or just the { goals, summary } part.
                const calcPart = (stored.goals && stored.summary) ? stored : (stored.calculation || null);

                if (calcPart && calcPart.goals) {
                    calculationResult = { calculation: calcPart };
                    console.log(`[ReportService] Using stored snapshot for client ${clientId}`);
                    isFromSnapshot = true;
                }
            } catch (e) {
                console.warn(`[ReportService] Failed to parse goals_summary for client ${clientId}:`, e.message);
            }
        }

        // 3. Fallback: Run Calculation only if snapshot is missing
        if (!isFromSnapshot) {
            console.log(`[ReportService] Snapshot missing or invalid, running fresh calculation for client ${clientId}`);

            // Normalize client for robust calculation (esp. for NSJ API which needs sex)
            const clientForCalc = {
                ...client,
                sex: client.gender || client.sex || 'male',
                birth_date: client.birth_date || '1985-01-01'
            };

            const rawGoals = client.goals || [];
            const preparedGoals = rawGoals.map(g => {
                let fromParams = {};
                try {
                    if (typeof g.params === 'string') fromParams = JSON.parse(g.params);
                    else if (typeof g.params === 'object' && g.params !== null) fromParams = g.params;
                } catch (e) { }

                const parsed = { ...fromParams, ...g };
                // Normalize types for calculation consistency
                const numericFields = ['target_amount', 'initial_capital', 'term_months', 'monthly_replenishment', 'priority', 'goal_type_id'];
                numericFields.forEach(f => { if (parsed[f] !== undefined) parsed[f] = Number(parsed[f]); });
                return parsed;
            });

            try {
                calculationResult = await calculationService.calculateFirstRun({
                    client: clientForCalc,
                    goals: preparedGoals
                });
            } catch (e) {
                console.error('[ReportService] Fallback Calculation Failed:', e);
                calculationResult = { calculation: { goals: [], summary: {} } };
            }
        }

        const calcData = calculationResult || {};
        const goalsReport = calcData.goals || [];
        const summary = calcData.summary || {};

        // 4. Section: Current Situation (Assets & Net Worth)
        // Recalculating from client data strictly to ensure consistency
        const assetsTotal = (client.assets || []).reduce((sum, a) => sum + Number(a.current_value || a.amount || 0), 0);
        const liabilitiesTotal = (client.liabilities || []).reduce((sum, l) => sum + Number(l.remaining_amount || 0), 0);

        const currentStats = {
            assets_total: assetsTotal,
            liabilities_total: liabilitiesTotal,
            net_worth: assetsTotal - liabilitiesTotal,
            assets_breakdown: (client.assets || []).map(a => ({
                name: a.name || a.type,
                value: Number(a.current_value || a.amount || 0)
            }))
        };

        // 5. Section: Overall Plan Metrics (Waterfall Data)
        // Now derived from the FRESH calculation 'goalsReport'
        let totalClientInvested = 0;
        let totalStateSupportNominal = 0;
        let totalProjectedCapital = 0;

        goalsReport.forEach(res => {
            // Client Investment
            const initial = res.summary?.initial_capital || res.smart_initial_capital || 0;
            const monthly = res.summary?.monthly_replenishment || 0;
            const months = res.summary?.target_months || res.summary?.term_months || 120; // fallback

            totalClientInvested += initial + (monthly * months);

            // State Support
            const tax = res.summary?.total_tax_benefit || res.details?.totals?.total_deductions || 0;
            const cofin = res.summary?.total_cofinancing || res.details?.totals?.total_cofinancing || 0;
            totalStateSupportNominal += (tax + cofin);

            // Projected Result
            const cap = res.summary?.projected_capital_at_end
                || res.summary?.projected_capital_at_retirement
                || res.summary?.total_capital_at_end
                || res.summary?.expected_cash_value
                || 0;

            totalProjectedCapital += cap;
        });

        // Fix negative income if projection is weirdly low (shouldn't happen with correct calc)
        const investmentIncome = Math.max(0, totalProjectedCapital - totalClientInvested - totalStateSupportNominal);

        const overallPlan = {
            chart_waterfall: {
                invested_by_client: Math.round(totalClientInvested),
                state_support_nominal: Math.round(totalStateSupportNominal),
                investment_income: Math.round(investmentIncome),
                total_projected: Math.round(totalProjectedCapital)
            },
            consolidated_portfolio: summary.consolidated_portfolio || {},
            tax_benefits: summary.tax_benefits_summary || {}
        };

        // 6. Section: AI Executive Summary
        const aiSummary = await this._generateExecutiveSummary(client, overallPlan, goalsReport);

        return {
            client_info: {
                id: client.id,
                full_name: `${client.last_name || ''} ${client.first_name || ''} ${client.middle_name || ''}`.trim(),
                age: this.calculateAge(client.birth_date),
                email: client.email,
                avatar_url: client.avatar_url
            },
            current_situation: currentStats,
            overall_plan: overallPlan,
            goals_detailed: goalsReport,
            ai_executive_summary: aiSummary
        };
    }

    async _generateExecutiveSummary(client, plan, goals) {
        const invested = plan.chart_waterfall.invested_by_client;
        const support = plan.chart_waterfall.state_support_nominal;
        const total = plan.chart_waterfall.total_projected;
        const profit = plan.chart_waterfall.investment_income;

        // Efficiency metric: How much 1 ruble of investment brings?
        const multiplier = invested > 0 ? (total / invested).toFixed(2) : 0;

        // Helper to extract insurance info
        const lifeGoals = goals.filter(g => g.goal_type === 'LIFE' || g.goal_id === 5);
        let insuranceText = "";
        let collectedRisks = []; // Array to store all risks for JSON output

        if (lifeGoals.length > 0) {
            insuranceText = "\n        СТРАХОВАЯ ЗАЩИТА (ВАЖНО упомянуть, если есть):";
            lifeGoals.forEach(g => {
                if (g.details && g.details.risks && Array.isArray(g.details.risks)) {
                    insuranceText += `\n        - Программа "${g.details.program_name || g.goal_name}":`;
                    g.details.risks.forEach(r => {
                        insuranceText += `\n          * ${r.risk_name}: ${parseInt(r.limit_amount).toLocaleString('ru-RU')} ₽`;
                    });
                    // Collect for JSON response
                    collectedRisks.push({
                        program_name: g.details.program_name || g.goal_name,
                        risks: g.details.risks
                    });
                }
            });
        }

        const systemPrompt = `Ты — финансовый эксперт. Твоя задача — написать "Резюме для клиента" (Executive Summary) для PDF-отчета.
        
        ВАЖНО: ОТВЕЧАЙ СТРОГО НА РУССКОМ ЯЗЫКЕ. Использование китайских иероглифов или других языков КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО.
        
        ДАННЫЕ КЛИЕНТА:
        - Имя: ${client.first_name}
        - Целей: ${goals.length}
        - Личные вложения за весь срок: ${invested.toLocaleString('ru-RU')} ₽
        - Помощь государства (вычеты, софинансирование): ${support.toLocaleString('ru-RU')} ₽
        - Инвестиционный доход: ${profit.toLocaleString('ru-RU')} ₽
        - ИТОГОВЫЙ КАПИТАЛ: ${total.toLocaleString('ru-RU')} ₽ (Рост капитала в ${multiplier} раза)${insuranceText}
        
        ИНСТРУКЦИЯ:
        Напиши 3 коротких абзаца (в формате Markdown, без заголовков "Абзац 1"):
        1. Похвали за начало пути и текущее состояние (или амбициозность плана).
        2. Подсвети эффективность: упомяни, какую долю составляет помощь государства и сложный процент. (Например: "Государство добавит к вашим вложениям X рублей, что существенно ускорит..."). Если есть страхование жизни, обязательно упомяни про защиту семьи (лимиты).
        3. Дай одну главную рекомендацию или предостережение (например, про дисциплину пополнений или важность реинвестирования вычетов).
        
        Тон: Профессиональный, ободряющий, но реалистичный. ТОЛЬКО РУССКИЙ ЯЗЫК.`;

        // Generate Summary
        let aiGeneratedSummary = "Не удалось сгенерировать резюме.";
        try {
            const messages = [{ role: 'system', content: systemPrompt }];
            aiGeneratedSummary = await aiService.getCompletion(messages, 'Qwen/Qwen2.5-14B-Instruct');
        } catch (e) {
            console.error('AI Summary generation failed:', e);
        }

        return {
            summary_text: aiGeneratedSummary,
            insurance_protection: collectedRisks // New field for Frontend
        };
    }
}

module.exports = new ReportService();
