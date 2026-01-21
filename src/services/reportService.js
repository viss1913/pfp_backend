const clientService = require('./clientService');
const aiService = require('./aiService');

class ReportService {
    async getClientReportData(clientId) {
        // 1. Fetch Client & Calculation Data
        const client = await clientService.getFullClient(clientId);
        if (!client) throw new Error('Client not found');

        let calculation = {};
        try {
            calculation = (typeof client.goals_summary === 'string')
                ? JSON.parse(client.goals_summary)
                : (client.goals_summary || {});
        } catch (e) {
            console.error('Failed to parse goals_summary:', e);
        }

        const goals = calculation.goals || [];
        const summary = calculation.summary || {};

        // 2. Section: Current Situation (Assets & Net Worth)
        const currentStats = {
            assets_total: Number(client.assets_total || 0),
            liabilities_total: Number(client.liabilities_total || 0),
            net_worth: Number(client.net_worth || 0),
            assets_breakdown: (client.assets || []).map(a => ({
                name: a.name || a.type,
                value: Number(a.current_value || a.amount || 0)
            }))
        };

        // 3. Section: Overall Plan Metrics (Waterfall Data)
        // We need to sum up flows from all goals
        let totalClientInvested = 0;
        let totalStateSupportNominal = 0;
        let totalProjectedCapital = 0;

        goals.forEach(res => {
            // Client Investment (Initial + Monthly * Months)
            const initial = res.summary?.initial_capital || 0; // Own capital used
            const monthly = res.summary?.monthly_replenishment || 0;
            const months = res.summary?.target_months || res.summary?.term_months || 120; // fallback

            totalClientInvested += initial + (monthly * months);

            // State Support (Nominal)
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

        // 4. Section: AI Executive Summary
        const aiSummary = await this._generateExecutiveSummary(client, overallPlan, goals);

        return {
            client_profile: {
                id: client.id,
                full_name: `${client.last_name} ${client.first_name} ${client.middle_name || ''}`.trim(),
                age: calculation.client_profile?.age || 0,
                email: client.email
            },
            current_situation: currentStats,
            overall_plan: overallPlan,
            goals_detailed: goals,
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

        const systemPrompt = `Ты — финансовый эксперт. Твоя задача — написать "Резюме для клиента" (Executive Summary) для PDF-отчета.
        
        ДАННЫЕ КЛИЕНТА:
        - Имя: ${client.first_name}
        - Целей: ${goals.length}
        - Личные вложения за весь срок: ${invested.toLocaleString('ru-RU')} ₽
        - Помощь государства (вычеты, софинансирование): ${support.toLocaleString('ru-RU')} ₽
        - Инвестиционный доход: ${profit.toLocaleString('ru-RU')} ₽
        - ИТОГОВЫЙ КАПИТАЛ: ${total.toLocaleString('ru-RU')} ₽ (Рост капитала в ${multiplier} раза)
        
        ИНСТРУКЦИЯ:
        Напиши 3 коротких абзаца (в формате Markdown, без заголовков "Абзац 1"):
        1. Похвали за начало пути и текущее состояние (или амбициозность плана).
        2. Подсвети эффективность: упомяни, какую долю составляет помощь государства и сложный процент. (Например: "Государство добавит к вашим вложениям X рублей, что существенно ускорит...").
        3. Дай одну главную рекомендацию или предостережение (например, про дисциплину пополнений или важность реинвестирования вычетов).
        
        Тон: Профессиональный, ободряющий, но реалистичный.`;

        try {
            // Using 14B model via aiService
            const messages = [{ role: 'system', content: systemPrompt }];
            return await aiService.getCompletion(messages, 'Qwen/Qwen2.5-14B-Instruct');
        } catch (e) {
            console.error('AI Summary generation failed:', e);
            return "Не удалось сгенерировать резюме. Пожалуйста, обратитесь к консультанту.";
        }
    }
}

module.exports = new ReportService();
