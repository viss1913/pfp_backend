const aiService = require('./aiService');
const knex = require('../config/database');
const homeOwnersCalculator = require('./calculators/HomeOwnersCalculator');
const { generateHomeOwnersPdf } = require('../utils/pdfGenerator');
const calculationService = require('./calculationService');
const path = require('path');
const fs = require('fs');

class ConstructorAiService {
    /**
     * Шаг 1: Классификация - определение следующей стадии диалога
     */
    async classifyStage(session, userMessage) {
        const { current_command_id, client_id } = session;

        // 1. Получаем все доступные команды для этого бота (или глобальные шаблоны)
        // Приоритезируем команды конкретного бота над шаблонами
        const client = await knex('constructor_clients').where('id', client_id).first();
        if (!client) {
            console.error(`[AI Step 1] Client ${client_id} not found!`);
            return null;
        }

        const bot = await knex('constructor_bots').where('id', client.bot_id).first();
        if (!bot) {
            console.error(`[AI Step 1] Bot ${client.bot_id} not found!`);
            return null;
        }

        console.log(`[AI Step 1] Fetching commands for Bot ID: ${bot.id} (Name: ${bot.name})`);

        const commands = await knex('constructor_commands')
            .where('bot_id', bot.id)
            .orWhere(function () {
                this.where('is_template', true).andWhere('project_id', bot.project_id);
            })
            .orderByRaw('bot_id DESC, is_template ASC'); // Бот > Шаблон

        console.log(`[AI Step 1] Found ${commands.length} commands.`);

        // 2. Формируем контекст классификатора
        let currentCommand = null;
        if (current_command_id) {
            currentCommand = commands.find(c => Number(c.id) === Number(current_command_id));
        }

        // 1.5 Принудительно выбираем /start для первого сообщения если это /start
        if (!current_command_id && userMessage.trim().toLowerCase().includes('/start')) {
            const startCmd = commands.find(c => c.command === '/start');
            if (startCmd) return startCmd;
        }

        // 1.6 Получаем историю для классификатора
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(5); // Для классификации достаточно 5 последних сообщений

        const historyMessages = history.reverse().map(log => ([
            { role: 'user', content: log.input_text },
            { role: 'assistant', content: log.response_generated || '' }
        ])).flat();

        const classifierInstructions = currentCommand ? currentCommand.classifier : "Определи начальную стадию диалога.";

        const prompt = [
            {
                role: 'system',
                content: `Ты — классификатор стадий диалога. 
Твоя задача: на основе сообщения пользователя, истории переписки и инструкций определить ключ (command) следующей стадии.
Доступные команды: ${commands.map(c => c.command).join(', ')}.
Инструкции по переключению (текущая стадия: ${currentCommand ? currentCommand.command : 'начало'}): ${classifierInstructions}

ОТВЕТЬ ТОЛЬКО КЛЮЧОМ КОМАНДЫ (например: /meeting). 
Если сообщение пользователя не требует переключения стадии или ты не уверен, верни текущую команду (или /start если это начало). 
Не пиши ничего кроме ключа команды.`
            },
            ...historyMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];

        try {
            console.log(`[AI Step 1] Client: ${client_id}, Bot: ${bot.id}`);
            console.log(`[AI Step 1] User Message: "${userMessage}"`);
            console.log(`[AI Step 1] System Prompt Instructions: ${classifierInstructions}`);

            const result = await aiService.getCompletion(prompt);

            // Очистка ответа (удаляем точки, кавычки и извлекаем первое слово-команду)
            const detectedCommand = result.trim().replace(/[."'`#*@]/g, '').split(' ')[0];

            console.log(`[AI Step 1] Detected Command (Raw): "${result}"`);
            console.log(`[AI Step 1] Detected Command (Clean): "${detectedCommand}"`);

            let nextCommand = commands.find(c => c.command === detectedCommand);

            // Если команда не распознана, остаемся на текущей или выбираем /start
            if (!nextCommand) {
                nextCommand = currentCommand || commands.find(c => c.command === '/start');
            }

            if (nextCommand && (!currentCommand || Number(nextCommand.id) !== Number(current_command_id))) {
                console.log(`[AI Step 1] Stage Switch: ${currentCommand ? currentCommand.command : 'None'} -> ${nextCommand.command}`);
            }

            return nextCommand;
        } catch (error) {
            console.error('[AI Step 1] Classification error:', error);
            return currentCommand;
        }
    }

    /**
     * Извлечение параметров для расчета страхования имущества из истории диалога
     */
    async extractHomeOwnersParams(session, userMessage) {
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(10);

        const historyText = history.reverse().map(log =>
            `User: ${log.input_text}\nAssistant: ${log.response_generated}`
        ).join('\n');

        const fullContext = historyText + `\nUser: ${userMessage}`;

        const prompt = [
            {
                role: 'system',
                content: `Ты — аналитик данных. Твоя задача: извлечь параметры для расчета страхования квартиры из диалога.
Ищи следующие значения (суммы страхования):
1. finish (отделка/ремонт)
2. property (имущество)
3. civil (ГО/гражданская ответственность)

ОТВЕТЬ ТОЛЬКО ЧИСТЫМ JSON без пояснений. Если значение не найдено, используй 0.
Если в тексте написано "2 млн", это значит 2000000. Если "500 тыс", это 500000.
Пример: {"finish": 500000, "property": 300000, "civil": 1000000}
`
            },
            {
                role: 'user',
                content: `Диалог:\n${fullContext}`
            }
        ];

        try {
            console.log(`[AI Extraction] Context for extraction: ${fullContext}`);
            const result = await aiService.getCompletion(prompt);
            console.log(`[AI Extraction] Raw AI result: ${result}`);
            const cleanResult = result.replace(/```json|```/g, '').trim();
            const extracted = JSON.parse(cleanResult);
            console.log(`[AI Extraction] Clean Extracted Params:`, extracted);
            return extracted;
        } catch (error) {
            console.error('[AI] Error extracting homeOwners params:', error);
            return { finish: 0, property: 0, civil: 0 };
        }
    }

    /**
     * Извлечение комплексных параметров для финансового плана (/firstRun)
     */
    async extractFinancialPlanParams(session, userMessage) {
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(15);

        const historyText = history.reverse().map(log =>
            `User: ${log.input_text}\nAssistant: ${log.response_generated}`
        ).join('\n');

        const fullContext = historyText + `\nUser: ${userMessage}`;

        const prompt = [
            {
                role: 'system',
                content: `Ты — финансовый аналитик. Твоя задача: извлечь данные о клиенте и его целях из диалога для расчета финансового плана (на текущий 2026 год).

Возвращай ТОЛЬКО чистый JSON по следующей структуре:
{
  "client": {
    "sex": "male" или "female",
    "birth_date": "YYYY-MM-DD (дата рождения, посчитай учитывая сегодняшний день и возраст клиента)",
    "avg_monthly_income": число (доход в месяц),
    "total_liquid_capital": число (текущие накопления)
  },
  "goals": [
    {
      "goal_type_id": число (1-Пенсия/Госпенсия, 2-Пассивный доход, 3-Инвестиции/Просто посчитать, 4-Прочее/Квартира/Дом/Бизнес),
      "name": "Название цели (например: Квартира, Пассивный доход, Капитал для ребенка)",
      "target_amount": число (желаемая сумма: стоимость цели ИЛИ желаемый доход в месяц для типов 1 и 2),
      "term_months": число (через сколько месяцев),
      "desired_monthly_income": число (желаемый доход в месяц, дублируй сюда для типов 1 и 2),
      "monthly_replenishment": число (сколько готов откладывать ежемесячно - только для типа 3)
    }
  ]
}

ПРАВИЛА:
1. Если какое-то поле не найдено, используй значения по умолчанию: birth_date "1990-01-01", income 100000, capital 0.
2. Если в тексте "30 лет", высчитай дату рождения от 2026 года.
3. Если целей нет, массив "goals" пуст.
`
            },
            {
                role: 'user',
                content: `Диалог:\n${fullContext}`
            }
        ];

        try {
            console.log(`[AI Extraction] Extracting Financial Params...`);
            const result = await aiService.getCompletion(prompt);
            const cleanResult = result.replace(/```json|```/g, '').trim();
            const extracted = JSON.parse(cleanResult);

            // Настаиваем на BALANCED для всех целей из мессенджера
            if (extracted.goals && Array.isArray(extracted.goals)) {
                extracted.goals = extracted.goals.map(g => ({
                    ...g,
                    risk_profile: 'BALANCED'
                }));
            }

            console.log(`[AI Extraction] Extracted with Balanced Profile:`, extracted);
            return extracted;
        } catch (error) {
            console.error('[AI] Error extracting financial params:', error);
            return {
                client: { sex: 'male', birth_date: '1990-01-01', avg_monthly_income: 100000, total_liquid_capital: 0 },
                goals: []
            };
        }
    }

    /**
     * Шаг 2: Генерация ответа (Послойный промпт)
     */
    async generateResponse(session, command, userMessage, calculationResult = null) {
        const client = await knex('constructor_clients').where('id', session.client_id).first();
        const bot = await knex('constructor_bots').where('id', client.bot_id).first();

        // Получаем активные контексты Мозга (Brain) для конкретного проекта
        const brainContexts = await knex('constructor_brain_contexts')
            .where({
                is_active: true,
                project_id: bot.project_id
            })
            .orderBy('priority', 'desc');

        const brainSection = brainContexts.map(ctx => `--- ${ctx.title} ---\n${ctx.content}`).join('\n\n');

        // Получаем историю (последние 10 сообщений из логов)
        const history = await knex('constructor_logs')
            .where('session_id', session.id)
            .orderBy('created_at', 'desc')
            .limit(10);

        const historyMessages = history.reverse().map(log => ([
            { role: 'user', content: log.input_text },
            { role: 'assistant', content: log.response_generated }
        ])).flat();

        const layeredPrompt = [
            {
                role: 'system',
                content: `
Ты — ИИ-ассистент по имени "${bot.name || 'Помощник'}".

СЛОЙ 1 (БАЗОВЫЙ КОНТЕКСТ И ЗНАНИЯ):
${bot.base_brain_context || 'Ты — опытный финансовый консультант и помощник агента.'}
${brainSection ? '\nДополнительные инструкции из базы знаний:\n' + brainSection : ''}

СЛОЙ 2 (СТИЛИСТИКА ОБЩЕНИЯ):
${bot.communication_style || 'Общайся вежливо и профессионально.'}

СЛОЙ 3 (ТЕКУЩАЯ ЗАДАЧА/СЦЕНАРИЙ):
${command.response}
${calculationResult ? `
ВНИМАНИЕ! РАСЧЕТ ВЫПОЛНЕН. ТЫ ОБЯЗАН ИСПОЛЬЗОВАТЬ ДАННЫЕ ИЗ ЭТОГО JSON ДЛЯ ОТВЕТА ПОЛЬЗОВАТЕЛЮ:
${JSON.stringify(calculationResult, null, 2)}

Инструкция для ИИ по интерпретации JSON:
${calculationResult.summary ? `
Это ПОЛНЫЙ ФИНАНСОВЫЙ ПЛАН.
1. Озвучь итоговый капитал (summary.total_capital) к концу срока.
2. Пройдись по основным целям в массиве "goals" (назови цель, срок и сколько нужно инвестировать ежемесячно).
3. Упомяни налоговую выгоду и софинансирование от государства (summary.total_state_benefit).
4. Если есть "consolidated_portfolio", кратко скажи, что план сбалансирован.
` : `
Это расчет СТРАХОВАНИЯ ИМУЩЕСТВА.
Презентуй итоговую стоимость (total_premium) и кратко перечисли лимиты (limits), по которым шел расчет.
`}
` : ''}

СЛОЙ 4 (ДАННЫЕ О КЛИЕНТЕ):
Пользователя зовут: ${client.nickname || 'Неизвестно'}
${client.user_context || 'Информации о контексте клиента пока нет.'}

${!historyMessages.length ? `
ВНИМАНИЕ: Это твое ПЕРВОЕ сообщение пользователю. 
Инструкция: Представься, поздоровайся с пользователем по имени (если оно известно), кратко расскажи, чем ты можешь быть полезен, и назови свое имя (${bot.name}).
` : ''}

ВАЖНО:
1. СЛОЙ 3 (ТЕКУЩАЯ ЗАДАЧА) ИМЕЕТ НАИВЫСШИЙ ПРИОРИТЕТ.
2. Если в Слое 1 (База знаний) есть инструкции, противоречащие текущей задаче или забегающие вперед — ИГНОРИРУЙ ИХ.
3. Выполняй ТОЛЬКО то, что написано в Слое 3. Не задавай вопросов, которые не относятся к текущему шагу.
4. Придерживайся своей роли и стиля. Отвечай кратко и по делу.
5. Используй Markdown для оформления.
`
            },
            ...historyMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];

        try {
            console.log(`[AI Step 2] Generating response for command: ${command.command}`);
            console.log(`[AI Step 2] Layered Prompt (System): ${layeredPrompt[0].content}`);

            const responseText = await aiService.getCompletion(layeredPrompt);

            console.log(`[AI Step 2] AI Response: "${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}"`);

            return responseText;
        } catch (error) {
            console.error('[AI Step 2] Response generation error:', error);
            return "Извините, произошла ошибка. Попробуйте позже.";
        }
    }

    /**
     * Полный цикл обработки сообщения
     */
    async processMessage(botId, userId, nickname, userMessage) {
        const bot = await knex('constructor_bots').where('id', botId).first();
        if (!bot) return "Бот не найден.";

        if (userMessage && userMessage.trim().toLowerCase() === '/reset') {
            console.log(`[Lifecycle] Reset command received from ${nickname} (${userId})`);

            // Получаем клиента перед удалением для логов
            const clientToDelete = await knex('constructor_clients')
                .where({ bot_id: botId, user_id: userId })
                .first();

            if (clientToDelete) {
                // Удаляем клиента. Каскадное удаление (ON DELETE CASCADE) само удалит сессии и логи.
                await knex('constructor_clients').where('id', clientToDelete.id).del();
                console.log(`[Lifecycle] Data for client ${clientToDelete.id} successfully wiped.`);
            }

            return "Ваши данные и история диалога полностью удалены.";
        }

        let client = await knex('constructor_clients')
            .where({ bot_id: botId, user_id: userId })
            .first();

        if (!client) {
            [client] = await knex('constructor_clients').insert({
                bot_id: botId,
                user_id: userId,
                nickname: nickname
            });
            client = await knex('constructor_clients').where('id', client).first();
        }

        let session = await knex('constructor_sessions').where('client_id', client.id).first();
        if (!session) {
            console.log(`[Lifecycle] Creating new session for client ${client.id}`);
            [session] = await knex('constructor_sessions').insert({
                client_id: client.id
            });
            session = await knex('constructor_sessions').where('id', session).first();
        }

        console.log(`\n--- Processing Message from ${nickname} (${userId}) ---`);
        console.log(`[Flow] Session ID: ${session.id}, Current Command ID: ${session.current_command_id}`);

        // 1. Классификация
        console.log('[Flow] Starting classification...');
        const nextCommand = await this.classifyStage(session, userMessage);

        if (nextCommand) {
            console.log(`[Flow] Classification result: ${nextCommand.command} (ID: ${nextCommand.id})`);
        } else {
            console.warn('[Flow] Classification returned NULL. Using fallback.');
        }

        let calculationResult = null;
        let pdfPath = null;

        // Нормализация команды для сравнения (убираем регистр и пробелы)
        const cmdKey = nextCommand ? nextCommand.command.trim().toLowerCase() : '';

        // Общая логика расчёта страхования имущества (используется и для /homeownerscalc, и для /firstruninsurance)
        const runHomeOwnersCalculation = async () => {
            const limits = await this.extractHomeOwnersParams(session, userMessage);
            console.log(`[Flow] Performing Home Owners Calculation with limits:`, limits);
            const result = await homeOwnersCalculator.calculate({
                product_id: 1,
                object_params: {},
                limits
            });
            console.log(`[Flow] Calculation Success. Total Premium: ${result.total_premium}`);
            return { result, limits };
        };

        // Если перешли на стадию расчета или получили команду принудительно
        if (cmdKey === '/homeownerscalc') {
            try {
                const { result } = await runHomeOwnersCalculation();
                calculationResult = result;

                const tempDir = path.join(__dirname, '../../temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                const fileName = `calc_${session.id}_${Date.now()}.pdf`;
                const tempPath = path.join(tempDir, fileName);
                try {
                    pdfPath = await generateHomeOwnersPdf(calculationResult, tempPath);
                    console.log(`[Flow] PDF Generated: ${pdfPath}`);
                } catch (pdfErr) {
                    console.error('[Flow] PDF generation failed:', pdfErr);
                }
            } catch (calcErr) {
                console.error('[Flow] Calculation failed:', calcErr);
            }
        } else if (cmdKey === '/firstruninsurance') {
            // Сигнал от классификатора: пользователь ввёл данные → считаем страхование имущества и отдаём JSON в стадию презентации
            try {
                const { result } = await runHomeOwnersCalculation();
                calculationResult = result;
                console.log(`[Flow] /firstRunInsurance: calculation done, passing to response`);
            } catch (calcErr) {
                console.error('[Flow] /firstRunInsurance calculation failed:', calcErr);
            }
        } else if (cmdKey === '/firstrun') {
            console.log('[Flow] DEBUG: /firstRun command detected. Starting extraction...');
            const extraction = await this.extractFinancialPlanParams(session, userMessage);
            console.log(`[Flow] Performing Full Financial Plan Calculation for client:`, client.nickname);
            console.log(`[Flow] Extraction Result:`, JSON.stringify(extraction, null, 2));

            try {
                // Подготавливаем данные для calculationService
                const calcData = {
                    client: {
                        ...client,
                        ...extraction.client,
                        project_id: bot.project_id
                    },
                    goals: extraction.goals || []
                };

                console.log('[Flow] DEBUG: Calling calculationService.calculateFirstRun with:', JSON.stringify(calcData, null, 2));
                calculationResult = await calculationService.calculateFirstRun(calcData);
                console.log(`[Flow] FirstRun Calculation Success. Total Capital: ${calculationResult.summary?.total_capital}`);
            } catch (calcErr) {
                console.error('[Flow] FirstRun Calculation failed:', calcErr);
            }
        } else {
            console.log(`[Flow] DEBUG: Command ${nextCommand ? nextCommand.command : 'null'} did not match /homeOwnersCalc, /firstRunInsurance or /firstRun`);
        }

        // 2. Генерация ответа
        const responseText = await this.generateResponse(session, nextCommand, userMessage, calculationResult);

        // 3. Обновление сессии и логирование
        await knex('constructor_sessions')
            .where('id', session.id)
            .update({
                current_command_id: nextCommand ? nextCommand.id : null,
                updated_at: knex.fn.now()
            });

        await knex('constructor_logs').insert({
            session_id: session.id,
            input_text: userMessage,
            detected_command_id: nextCommand ? nextCommand.id : null,
            response_generated: responseText
        });

        console.log(`--- Message Processed (Next Command: ${nextCommand ? nextCommand.command : 'none'}) ---\n`);

        if (pdfPath) {
            return {
                text: responseText,
                document: pdfPath
            };
        }

        return responseText;
    }
}

module.exports = new ConstructorAiService();
