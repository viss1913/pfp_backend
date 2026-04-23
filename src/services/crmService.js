const db = require('../config/database');
const aiService = require('./aiService');

function safeParseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

function formatIsoDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function formatDateRu(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('ru-RU');
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function extractGoalsMeta(goalsSummary) {
    const parsed = safeParseJson(goalsSummary) || {};
    const calc = parsed.calculation || parsed;
    const goals = Array.isArray(calc?.goals) ? calc.goals : [];
    const consolidated = calc?.summary?.consolidated_portfolio || parsed?.summary?.consolidated_portfolio || {};

    let totalInitial = toNumber(consolidated.total_initial_capital);
    let totalMonthly = toNumber(consolidated.total_monthly_replenishment);

    if (!totalInitial && goals.length > 0) {
        totalInitial = goals.reduce((sum, g) => sum + toNumber(g?.summary?.initial_capital ?? g?.smart_initial_capital), 0);
    }
    if (!totalMonthly && goals.length > 0) {
        totalMonthly = goals.reduce((sum, g) => sum + toNumber(g?.summary?.monthly_replenishment), 0);
    }

    const goalTypes = Array.from(
        new Set(
            goals
                .map((g) => g?.goal_type_id ?? g?.goal_type)
                .filter((v) => v !== null && v !== undefined && v !== '')
                .map((v) => String(v))
        )
    );

    const lastPfpDate =
        formatIsoDate(parsed.generated_at) ||
        formatIsoDate(calc.generated_at) ||
        formatIsoDate(calc.updated_at) ||
        formatIsoDate(calc.created_at) ||
        formatIsoDate(parsed.updated_at) ||
        null;

    const topGoal = goals[0]?.goal_name || goals[0]?.name || 'Нет целей';
    const targetAmount = toNumber(goals[0]?.summary?.total_target_amount_future ?? goals[0]?.summary?.target_amount_future);
    const strategy = calc?.summary?.consolidated_portfolio?.assets_allocation?.[0]?.name || 'Не сформирован';

    return {
        goalsCount: goals.length,
        goalTypes,
        totalInitialCapital: Math.round(totalInitial),
        totalMonthlyReplenishment: Math.round(totalMonthly),
        topGoal,
        targetAmount: Math.round(targetAmount),
        strategy,
        lastPfpDate
    };
}

class CrmService {
    async resolveAgentDisplayName(agentId, fallbackAgent = null) {
        const inlineName = [fallbackAgent?.first_name, fallbackAgent?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim();
        if (fallbackAgent?.name) return fallbackAgent.name;
        if (inlineName) return inlineName;

        const row = await db('agents')
            .leftJoin('users', function () {
                this.on('users.agent_id', '=', 'agents.id').andOn('users.role', '=', db.raw('?', ['agent']));
            })
            .where('agents.id', agentId)
            .select(
                'agents.first_name as agent_first_name',
                'agents.last_name as agent_last_name',
                'users.name as user_name',
                'users.email as user_email'
            )
            .first();

        const agentName = [row?.agent_first_name, row?.agent_last_name].filter(Boolean).join(' ').trim();
        return row?.user_name || agentName || row?.user_email || fallbackAgent?.email || 'Агент';
    }

    /**
     * Retrieves specific clients that need attention (Thinking or Renewal)
     */
    async getAttentionRequiredClients(agentId) {
        // 1. Clients who are "THINKING" (Daily check)
        // In a real app we might filter by last_contact_date, but requirement is "every day"
        const thinkingClients = await db('clients')
            .where({
                agent_id: agentId,
                crm_status: 'THINKING'
            })
            .select('id', 'first_name', 'last_name', 'phone', 'crm_status_date', 'goals_summary');

        // 2. Clients ready for "RENEWAL"
        const today = new Date();
        const renewalClients = await db('clients')
            .where({
                agent_id: agentId,
                crm_status: 'RENEWAL'
            })
            .andWhere('next_action_date', '<=', today)
            .select('id', 'first_name', 'last_name', 'phone', 'next_action_date');

        return { thinkingClients, renewalClients };
    }

    /**
     * Get detailed summary of all clients for AI Context
     * Includes: Financial breakdown, Top Goals, Portfolio Structure
     */
    async getDetailedAgentClientsSummary(agentId) {
        const clients = await db('clients')
            .where({ agent_id: agentId })
            .select('*');

        const summary = [];

        for (const client of clients) {
            let financials = {};
            try {
                const netWorth = client.net_worth || 0;
                const goalsMeta = extractGoalsMeta(client.goals_summary);

                financials = {
                    net_worth: Math.round(netWorth),
                    goals_count: goalsMeta.goalsCount,
                    top_goal: goalsMeta.topGoal,
                    target: goalsMeta.targetAmount,
                    main_asset: goalsMeta.strategy,
                    total_initial_capital: goalsMeta.totalInitialCapital,
                    total_monthly_replenishment: goalsMeta.totalMonthlyReplenishment,
                    goal_types: goalsMeta.goalTypes,
                    last_pfp_date: goalsMeta.lastPfpDate || formatIsoDate(client.updated_at)
                };

            } catch (e) {
                financials = { error: 'Data parsing failed' };
            }

            summary.push({
                id: client.id,
                name: `${client.last_name} ${client.first_name}`,
                phone: client.phone,
                email: client.email,
                created_at: formatIsoDate(client.created_at),
                status: client.crm_status, // THINKING, BOUGHT, etc.
                next_action: formatDateRu(client.next_action_date),
                finance: financials
            });
        }

        return summary;
    }

    /**
     * Generates the daily briefing text using AI
     */
    async generateDailyBriefing(agentId, agentContext = null) {
        const allClients = await this.getDetailedAgentClientsSummary(agentId);
        const agentName = await this.resolveAgentDisplayName(agentId, agentContext || {});

        if (allClients.length === 0) {
            return `Доброе утро, ${agentName}! В вашей базе пока нет клиентов. Как только вы их добавите, я смогу подготовить для вас аналитическую сводку.`;
        }

        const thinking = allClients.filter(c => c.status === 'THINKING');
        const renewal = allClients.filter(c => c.status === 'RENEWAL');
        const bought = allClients.filter(c => c.status === 'BOUGHT');

        // Build prompt context
        let contextData = "CRM Portfolio Summary:\n";
        contextData += `- Total Clients: ${allClients.length}\n`;
        contextData += `- Thinking: ${thinking.length}\n`;
        contextData += `- Renewal: ${renewal.length}\n`;
        contextData += `- Bought: ${bought.length}\n\n`;

        contextData += "Client Details for Analysis:\n";
        allClients.forEach(c => {
            contextData += `- [${c.status}] ${c.name} (ID: ${c.id}). `;
            if (c.phone) contextData += `Тел: ${c.phone}. `;
            if (c.email) contextData += `Email: ${c.email}. `;
            if (c.created_at) contextData += `Создан: ${c.created_at}. `;
            if (c.finance.error) {
                contextData += "Финансовые данные не заполнены. ";
            } else {
                contextData += `Капитал: ${c.finance.net_worth.toLocaleString()}₽. `;
                contextData += `Цель: ${c.finance.top_goal}. `;
                contextData += `Стартовый капитал: ${(c.finance.total_initial_capital || 0).toLocaleString()}₽. `;
                contextData += `Итог. пополнение: ${(c.finance.total_monthly_replenishment || 0).toLocaleString()}₽/мес. `;
                contextData += `Типы целей: ${(c.finance.goal_types || []).join(', ') || 'нет'}. `;
                contextData += `Последний PFP: ${c.finance.last_pfp_date || 'N/A'}. `;
            }
            contextData += `След. шаг: ${c.next_action}\n`;
        });

        const systemPrompt = `Ты — элитный бизнес-ассистент финансового советника по имени {{agent_name}}. Твоя цель — быть правым плечом агента, помогать ему анализировать портфель и максимизировать эффективность работы с клиентами.
        
        ВХОДНЫЕ ДАННЫЕ (Твоя база знаний на сегодня):
        ${contextData}

        ТВОЙ СТИЛЬ:
        - Профессиональный, уверенный, энергичный и лаконичный.
        - Ты не просто робот, ты — партнер в бизнесе.
        - Обращайся к агенту уважительно, подчеркивая важность его задач.

        ИНСТРУКЦИЯ ПО СОСТАВЛЕНИЮ БРИФИНГА:
        1. Начни с профессионального приветствия: "Доброе утро, {{agent_name}}. Подготовил для вас аналитический срез по портфелю на сегодня."
        2. Дай краткую сводку: сколько клиентов в фокусе, какие ключевые изменения.
        3. СТРАТЕГИЧЕСКИЕ ПРИОРИТЕТЫ:
           - [RENEWAL]: Это ваш приоритет №1. Напомните, у кого подходят сроки.
           - [THINKING]: Выделите тех, кто на паузе. Предложите 1 убийственный аргумент для звонка, опираясь на их цель (${allClients.length > 0 ? 'например, ' + allClients[0].finance.top_goal : 'финансы'}).
        4. ЗАВЕРШЕНИЕ: Мотивирующее напутствие на день.
        
        Формат: Четкий маркированный список с акцентом на действия.
        `;

        // Execute AI call using OPENROUTER_MODEL from env when available
        const injectedPrompt = aiService.injectContext(systemPrompt, { ...(agentContext || {}), name: agentName });
        const messages = [{ role: 'system', content: injectedPrompt }];
        const selectedModel = (process.env.OPENROUTER_MODEL || '').trim() || 'Qwen/Qwen2.5-14B-Instruct';
        return await aiService.getCompletion(messages, selectedModel);
    }

    async updateClientStatus(clientId, status, notes, projectId = null) {
        const updateData = {
            crm_status: status,
            crm_status_date: db.fn.now(),
            updated_at: db.fn.now()
        };

        const filter = { id: clientId };
        if (projectId) filter.project_id = projectId;

        // Automatic logic for reminders
        if (status === 'THINKING') {
            // Remind tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            updateData.next_action_date = tomorrow;
        } else if (status === 'RENEWAL') {
            // Default renewal logic (e.g., set for 1 year from now? or let user set it? 
            // For now, let's strictly update the status. The frontend might send next_action_date later or we default.)
            // updateData.next_action_date = ... 
        } else {
            // Bought/Refused -> Clear reminder
            updateData.next_action_date = null;
        }

        if (notes) {
            updateData.notes = notes; // Assuming simple note append or overwrite. 
            // Better: append to notes/history. But schema has simple 'notes'.
        }

        await db('clients').where(filter).update(updateData);
        return { success: true, status, clientId };
    }
}

module.exports = new CrmService();
