const aiService = require('./aiService');
const knex = require('../config/database');
const homeOwnersCalculator = require('../algorithms/calculators/HomeOwnersCalculator');
const HomeOwnersService = require('./HomeOwnersService');
const { generateHomeOwnersPdf } = require('../utils/pdfGenerator');
const calculationService = require('./calculationService');
const path = require('path');
const fs = require('fs');

/** Полный трейс цепочки «классификатор → генератор»: `CONSTRUCTOR_AI_TRACE=0` выкл., иначе вкл. */
function isConstructorAiTraceOn() {
    return process.env.CONSTRUCTOR_AI_TRACE !== '0';
}

const TRACE_MAX_CONTENT = 6000;

function truncateTraceText(str, max = TRACE_MAX_CONTENT) {
    if (str == null) return '';
    const s = typeof str === 'string' ? str : String(str);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n... [truncated +${s.length - max} chars]`;
}

/**
 * Логирует массив сообщений для LLM: роль, длина текста, обрезанное тело.
 * @param {string} step — метка шага (например stream.step1_classifier_request)
 */
function traceConstructorMessages(step, messages) {
    if (!isConstructorAiTraceOn() || !Array.isArray(messages)) return;
    const parts = messages.map((m, i) => ({
        index: i,
        role: m.role,
        contentChars: (m.content || '').length,
        content: truncateTraceText(m.content || '', TRACE_MAX_CONTENT),
    }));
    console.log(`[ConstructorAI::TRACE] ${step}\n${JSON.stringify(parts, null, 2)}`);
}

function traceConstructorMeta(step, obj) {
    if (!isConstructorAiTraceOn()) return;
    console.log(`[ConstructorAI::TRACE] ${step} ${JSON.stringify(obj, null, 2)}`);
}

/** Сколько последних записей constructor_logs подмешивать в промпт (1 запись = 1 ход: user + assistant). */
function envPositiveInt(name, fallback) {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) && n >= 1 ? n : fallback;
}
const CLASSIFIER_HISTORY_LOG_ROWS = envPositiveInt('CONSTRUCTOR_CLASSIFIER_HISTORY_LOGS', 5);
const GENERATOR_HISTORY_LOG_ROWS = envPositiveInt('CONSTRUCTOR_GENERATOR_HISTORY_LOGS', 10);

/** Частые опечатки ключа команды в ответе классификатора → канонический ключ из БД */
const CLASSIFIER_COMMAND_TYPOS = {
    '/vozrtast': '/vozrast',
    '/startpf': '/startpfp',
};

function findCommandByKey(commands, key) {
    if (!key || !commands?.length) return null;
    const normalized = key.startsWith('/') ? key : `/${key}`;
    let row =
        commands.find((c) => c.command === normalized) ||
        commands.find((c) => c.command && c.command.toLowerCase() === normalized.toLowerCase());
    if (!row) {
        const alias = CLASSIFIER_COMMAND_TYPOS[normalized.toLowerCase()];
        if (alias) {
            row =
                commands.find((c) => c.command === alias) ||
                commands.find((c) => c.command && c.command.toLowerCase() === alias.toLowerCase());
        }
    }
    return row || null;
}

/**
 * На стадии /start после ответа именем (или отказа) должны уйти на /startpfp — модель часто ошибочно оставляет /start.
 */
function shouldForceStartpfpFromStart(userMessage) {
    const t = (userMessage || '').trim();
    if (!t || t.startsWith('/')) return false;
    if (t.length > 120) return false;

    if (/не\s+скажу|не\s+хочу|без\s+имени|секретно|анонимно|не\s+важно|не\s+буду\s+говорить|не\s+своё\s+имя/i.test(t)) {
        return true;
    }

    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) return false;
    if (!/^[\p{L}\s\-.']+$/u.test(t)) return false;

    const w0 = words[0];
    if (
        /^(как|что|где|почему|зачем|сколько|когда|кто|здравствуй|привет|добрый|доброе|спасибо|ок|окей|да|нет|хорошо|ладно)$/i.test(
            w0
        )
    ) {
        return false;
    }

    return true;
}

class ConstructorAiService {
    /** Команда /start, привязанная к боту (без шаблонов из orWhere). */
    async _getBotStartCommand(botId) {
        let row = await knex('constructor_commands').where({ bot_id: botId, command: '/start' }).first();
        if (!row) {
            row = await knex('constructor_commands')
                .where('bot_id', botId)
                .whereRaw('LOWER(command) = ?', ['/start'])
                .first();
        }
        return row || null;
    }

    /**
     * Первое сообщение в сессии (в логах ещё нет ходов): роутер (первый LLM) не вызываем —
     * сразу берём строку /start для слоя ответа (поле response). Со второго сообщения — classifyStage.
     */
    /**
     * История диалога в формате chat messages для OpenRouter.
     * Берётся из constructor_logs по session_id; текущий ход в лог ещё не записан — его добавляют отдельным последним user-сообщением.
     * @param {number} sessionId
     * @param {number} maxLogRows — число последних строк лога (не «сообщений»: одна строка = пара user+assistant)
     */
    async _loadTurnHistoryAsChatMessages(sessionId, maxLogRows) {
        const rows = await knex('constructor_logs')
            .where('session_id', sessionId)
            .orderBy('created_at', 'desc')
            .limit(maxLogRows);
        return rows
            .reverse()
            .flatMap((log) => [
                { role: 'user', content: log.input_text || '' },
                { role: 'assistant', content: log.response_generated || '' },
            ]);
    }

    async resolveCommandForSessionTurn(botId, session, userMessage, options = {}) {
        const traceStream = !!options.traceStream;
        const priorLogRow = await knex('constructor_logs').where('session_id', session.id).count('* as count').first();
        const priorLogCount = Number(priorLogRow?.count ?? 0);
        const isFirstTurn = priorLogCount === 0;

        if (isFirstTurn) {
            const startCmd = await this._getBotStartCommand(botId);
            if (startCmd) {
                if (traceStream && isConstructorAiTraceOn()) {
                    traceConstructorMeta('stream.first_turn_skip_classifier', {
                        reason: 'constructor_logs пуст — только контекст ответа из /start, роутер LLM не вызывается',
                        command: { id: startCmd.id, key: startCmd.command },
                    });
                }
                return {
                    nextCommand: startCmd,
                    isFirstTurn,
                    priorLogCount,
                    classifierSkipped: true,
                };
            }
            if (traceStream && isConstructorAiTraceOn()) {
                traceConstructorMeta('stream.first_turn_no_start_command', { botId, fallback: 'classifyStage' });
            }
        }

        const nextCommand = await this.classifyStage(session, userMessage);
        return {
            nextCommand,
            isFirstTurn,
            priorLogCount,
            classifierSkipped: false,
        };
    }

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

        const commandList = commands.map(c => c.command).join(', ');
        console.log(`[AI Step 1] Available commands: [${commandList}]`);

        // 2. Формируем контекст классификатора
        let currentCommand = null;
        if (current_command_id) {
            currentCommand = commands.find(c => Number(c.id) === Number(current_command_id));
        }

        // 1.5 Принудительно выбираем /start для первого сообщения если это /start
        if (!current_command_id && userMessage.trim().toLowerCase().includes('/start')) {
            const startCmd = findCommandByKey(commands, '/start');
            if (startCmd) {
                traceConstructorMeta('step1_classifier_shortcut', {
                    reason: 'user message contains /start',
                    resolved: { id: startCmd.id, command: startCmd.command },
                });
                return startCmd;
            }
        }

        // 1.6 История для роутера (последние N ходов; текущий user — отдельным сообщением в конце промпта)
        const historyMessages = await this._loadTurnHistoryAsChatMessages(session.id, CLASSIFIER_HISTORY_LOG_ROWS);

        // Пока сессия без current_command_id — логически мы на стадии /start: берём classifier из команды /start из БД, а не заглушку «Определи начальную стадию».
        const startCmdForRouter = findCommandByKey(commands, '/start');
        const classifierInstructions = currentCommand
            ? currentCommand.classifier
            : (startCmdForRouter?.classifier || 'Определи начальную стадию диалога.');
        const currentStageKey = currentCommand
            ? currentCommand.command
            : (startCmdForRouter ? '/start' : '(начало диалога — выбери подходящую команду из списка)');
        const stayOnStageHint = currentCommand
            ? currentCommand.command
            : (startCmdForRouter ? '/start' : 'ту команду из списка, которая лучше всего подходит как старт');

        const prompt = [
            {
                role: 'system',
                content: `Ты — классификатор стадий диалога (роутер). 
Твоя задача: по последнему сообщению пользователя, краткой истории и ИНСТРУКЦИЯМ ТЕКУЩЕЙ СТАДИИ выбрать ОДНУ команду — ключ следующей стадии.

СПИСОК ДОПУСТИМЫХ КОМАНД (ответь строго одним из этих ключей, символ / обязателен): ${commandList}.

ТЕКУЩАЯ СТАДИЯ: ${currentStageKey}
ИНСТРУКЦИИ ПЕРЕКЛЮЧЕНИЯ ДЛЯ ЭТОЙ СТАДИИ:
${classifierInstructions}

ПРАВИЛА:
1) Если инструкции явно говорят перейти на команду X при выполнении условия — и условие выполнено — верни X.
2) Если условие перехода не выполнено — верни ТЕКУЩУЮ стадию: ${stayOnStageHint}.
3) Не выдумывай ключи вне списка. Не добавляй пояснений.

ОТВЕТ: только ключ команды, одна строка (пример: /startpfp).`
            },
            ...historyMessages,
            {
                role: 'user',
                content: userMessage
            }
        ];

        traceConstructorMeta('step1_classifier_context', {
            sessionId: session.id,
            clientId: client_id,
            botId: bot.id,
            projectId: bot.project_id,
            userMessagePreview: truncateTraceText(userMessage, 500),
            current_command_id,
            currentStageFromSession: currentCommand ? { id: currentCommand.id, command: currentCommand.command } : null,
            classifierSource: currentCommand ? 'session_current_command' : (startCmdForRouter ? '/start row (no session stage yet)' : 'generic fallback'),
            promptStageLabel: currentStageKey,
            classifierInstructionsPreview: truncateTraceText(classifierInstructions, 1500),
            historyTurnsForClassifier: historyMessages.length / 2,
            commandListKeys: commandList,
            commandRowsTotal: commands.length,
        });
        traceConstructorMessages('step1_classifier_llm_request', prompt);

        try {
            console.log(`[AI Step 1] Client: ${client_id}, Bot: ${bot.id}`);
            console.log(`[AI Step 1] User Message: "${userMessage}"`);
            console.log(`[AI Step 1] System Prompt Instructions: ${classifierInstructions}`);

            const result = await aiService.getCompletion(prompt);

            // Очистка ответа: убираем markdown (**), кавычки, берём первое слово
            const rawTrimmed = result.trim();
            const cleaned = rawTrimmed.replace(/[."'`#*@]/g, '').trim();
            const detectedCommand = (cleaned.startsWith('/') ? cleaned : `/${cleaned}`).split(/\s+/)[0];

            console.log(`[AI Step 1] Classifier RAW response: "${rawTrimmed}"`);
            console.log(`[AI Step 1] Classifier cleaned command: "${detectedCommand}"`);

            traceConstructorMeta('step1_classifier_llm_response', {
                raw: rawTrimmed,
                parsedKey: detectedCommand,
            });

            let nextCommand = findCommandByKey(commands, detectedCommand);

            // Если команда не распознана — остаёмся на текущей или /start
            if (!nextCommand) {
                console.log(`[AI Step 1] Command "${detectedCommand}" not in list; fallback to current or /start`);
                nextCommand = currentCommand || findCommandByKey(commands, '/start');
                traceConstructorMeta('step1_classifier_fallback', {
                    reason: 'key not in list',
                    fallbackTo: nextCommand ? { id: nextCommand.id, command: nextCommand.command } : null,
                });
            }

            let forcedStartpfp = false;
            // Детерминированно: на /start ответ именем или отказом → /startpfp (если есть в сценарии)
            const onStart =
                currentCommand && String(currentCommand.command || '').toLowerCase() === '/start';
            const stillOnStart = nextCommand && String(nextCommand.command || '').toLowerCase() === '/start';
            if (onStart && stillOnStart) {
                const startpfp = findCommandByKey(commands, '/startpfp');
                if (startpfp && shouldForceStartpfpFromStart(userMessage)) {
                    console.log('[AI Step 1] Forced transition /start -> /startpfp (name or refuse pattern)');
                    nextCommand = startpfp;
                    forcedStartpfp = true;
                }
            }

            traceConstructorMeta('step1_classifier_resolved', {
                nextCommand: nextCommand ? { id: nextCommand.id, command: nextCommand.command } : null,
                forcedStartpfp,
                namePatternMatched: shouldForceStartpfpFromStart(userMessage),
            });

            if (nextCommand && (!currentCommand || Number(nextCommand.id) !== Number(current_command_id))) {
                console.log(`[AI Step 1] Stage Switch: ${currentCommand ? currentCommand.command : 'None'} -> ${nextCommand.command}`);
            }

            return nextCommand;
        } catch (error) {
            traceConstructorMeta('step1_classifier_error', { message: error.message, stack: error.stack });
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
1. constructive (конструктив/стены)
2. finish (отделка/ремонт)
3. property (имущество)
4. civil (ГО/гражданская ответственность)

ОТВЕТЬ ТОЛЬКО ЧИСТЫМ JSON без пояснений. Если значение не найдено, используй 0.
Если в тексте написано "2 млн", это значит 2000000. Если "500 тыс", это 500000.
Пример: {"constructive": 500000, "finish": 300000, "property": 200000, "civil": 1000000}
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
            return { constructive: 0, finish: 0, property: 0, civil: 0 };
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

        const historyMessages = await this._loadTurnHistoryAsChatMessages(session.id, GENERATOR_HISTORY_LOG_ROWS);

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
` : calculationResult.calculations && Array.isArray(calculationResult.calculations) ? `
Это расчёты СТРАХОВАНИЯ ИМУЩЕСТВА по нескольким программам/компаниям.
Презентуй по каждой программе из массива "calculations": название (product_name), итоговая премия (total_premium), лимиты (limits). Можно сравнить предложения и выделить выгодный вариант.
` : `
Это расчет СТРАХОВАНИЯ ИМУЩЕСТВА (одна программа).
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
     * Генерация ответа (streaming SSE) для конструктора.
     * Важно: используется только для финального текста (классификация всё равно non-stream).
     */
    async generateResponseStream(session, command, userMessage, calculationResult = null, res) {
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

        const historyMessages = await this._loadTurnHistoryAsChatMessages(session.id, GENERATOR_HISTORY_LOG_ROWS);

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
` : calculationResult.calculations && Array.isArray(calculationResult.calculations) ? `
Это расчёты СТРАХОВАНИЯ ИМУЩЕСТВА по нескольким программам/компаниям.
Презентуй по каждой программе из массива "calculations": название (product_name), итоговая премия (total_premium), лимиты (limits). Можно сравнить предложения и выделить выгодный вариант.
` : `
Это расчет СТРАХОВАНИЯ ИМУЩЕСТВА (одна программа).
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

        traceConstructorMeta('step2_generator_context', {
            sessionId: session.id,
            botId: bot.id,
            projectId: bot.project_id,
            commandForLayer3: command.command || '(synthetic empty)',
            commandId: command.id != null ? command.id : null,
            layer3ResponsePreview: truncateTraceText(command.response || '', 2000),
            historyMessageCount: layeredPrompt.length - 2,
            hasCalculationJson: !!calculationResult,
        });
        traceConstructorMessages('step2_generator_llm_request_stream', layeredPrompt);

        // Сайт-чат: нормализованный SSE (type=text|done), не сырой OpenRouter — иначе фронт рисует [DONE] и JSON-чанки
        const fullText = await aiService.streamCompletion(layeredPrompt, null, res, { sseFormat: 'pfp' });

        traceConstructorMeta('step2_generator_llm_response_stream_done', {
            fullTextChars: (fullText || '').length,
            fullTextPreview: truncateTraceText(fullText || '', 1200),
        });

        return fullText;
    }

    /**
     * Полный цикл обработки сообщения с SSE стримингом финального ответа.
     * Используется для "чат на сайте" без регистрации.
     */
    async processMessageStream(botId, userId, nickname, userMessage, res) {
        const bot = await knex('constructor_bots').where('id', botId).first();
        if (!bot) return;

        if (userMessage && userMessage.trim().toLowerCase() === '/reset') {
            const clientToDelete = await knex('constructor_clients')
                .where({ bot_id: botId, user_id: userId })
                .first();
            if (clientToDelete) {
                await knex('constructor_clients').where('id', clientToDelete.id).del();
            }
            // Пишем в SSE и закрываем соединение.
            res.write(`data: ${JSON.stringify({ type: 'text', text: 'Ваши данные и история диалога полностью удалены.' })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();
            return;
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
            [session] = await knex('constructor_sessions').insert({
                client_id: client.id
            });
            session = await knex('constructor_sessions').where('id', session).first();
        }

        traceConstructorMeta('stream.turn_start', {
            botId,
            userId,
            nickname,
            userMessagePreview: truncateTraceText(userMessage, 800),
            sessionId: session.id,
            clientId: client.id,
            current_command_id_before: session.current_command_id,
        });

        // 1) Стадия: первый ход сессии — без роутера, сразу /start для генерации; дальше — classifyStage
        const {
            nextCommand,
            isFirstTurn: isFirstStreamTurn,
            priorLogCount: priorCount,
            classifierSkipped,
        } = await this.resolveCommandForSessionTurn(botId, session, userMessage, { traceStream: true });

        traceConstructorMeta('stream.after_router', {
            isFirstStreamTurn,
            priorLogCount: priorCount,
            classifierSkipped,
            effectiveCommand: nextCommand
                ? { id: nextCommand.id, command: nextCommand.command, layer3Chars: (nextCommand.response || '').length }
                : null,
        });

        const cmdKey = nextCommand ? nextCommand.command.trim().toLowerCase() : '';

        let calculationResult = null;
        let pdfPath = null;

        // Технически расчёты и PDF тут могут быть, но для сайта пока достаточно текстовой ветки.
        // Мы оставляем логику как в processMessage, но не отдаем PDF отдельно (Telegram его отдаёт иначе).
        if (cmdKey === '/homeownerscalc') {
            const limits = await this.extractHomeOwnersParams(session, userMessage);
            const products = await HomeOwnersService.getProducts(true);

            if (!products || !products.length) {
                const single = await homeOwnersCalculator.calculate({
                    product_id: 1,
                    object_params: {},
                    limits
                });
                calculationResult = { calculations: [{ product_id: 1, product_name: 'Страхование', ...single }], limits };
            } else {
                const calculations = [];
                for (const product of products) {
                    try {
                        const result = await homeOwnersCalculator.calculate({
                            product_id: product.id,
                            object_params: {},
                            limits
                        });
                        calculations.push({
                            product_id: product.id,
                            product_name: product.name || product.title || `Продукт ${product.id}`,
                            ...result
                        });
                    } catch (err) {
                        console.error(`[Flow] Calc failed for product ${product.id}:`, err.message);
                    }
                }
                calculationResult = { calculations, limits };
            }
        } else if (cmdKey === '/firstrun') {
            const extraction = await this.extractFinancialPlanParams(session, userMessage);
            try {
                const calcData = {
                    client: {
                        ...client,
                        ...extraction.client,
                        project_id: bot.project_id
                    },
                    goals: extraction.goals || []
                };
                calculationResult = await calculationService.calculateFirstRun(calcData);
            } catch (calcErr) {
                console.error('[Flow] FirstRun Calculation failed:', calcErr);
            }
        }

        // 2) Стриминг ответа
        const responseText = await this.generateResponseStream(session, nextCommand || { response: '' }, userMessage, calculationResult, res);

        traceConstructorMeta('stream.turn_complete', {
            sessionId: session.id,
            saved_current_command_id: nextCommand ? nextCommand.id : null,
            replyChars: (responseText || '').length,
            replyPreview: truncateTraceText(responseText || '', 1500),
        });

        // 3) Обновление сессии и логирование (после завершения стрима, но без записи в res)
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

            return { text: "Ваши данные и история диалога полностью удалены.", plain: true };
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

        const { nextCommand, classifierSkipped } = await this.resolveCommandForSessionTurn(botId, session, userMessage);
        if (classifierSkipped) {
            console.log('[Flow] First session turn: skipped classifier, using /start response context only');
        } else {
            console.log('[Flow] Classification done');
        }
        if (nextCommand) {
            console.log(`[Flow] Command for this turn: ${nextCommand.command} (ID: ${nextCommand.id})`);
        } else {
            console.warn('[Flow] No command resolved (null).');
        }

        let calculationResult = null;
        let pdfPath = null;

        // Нормализация команды для сравнения (убираем регистр и пробелы)
        const cmdKey = nextCommand ? nextCommand.command.trim().toLowerCase() : '';
        console.log(`[Flow] Command for this turn: "${nextCommand ? nextCommand.command : 'null'}" (cmdKey: ${cmdKey}); will run calculation: ${cmdKey === '/homeownerscalc' || cmdKey === '/firstrun'}`);

        // Расчёт страхования имущества по всем активным продуктам (команда /homeownerscalc)
        const runHomeOwnersCalculation = async () => {
            const limits = await this.extractHomeOwnersParams(session, userMessage);
            console.log(`[Flow] Performing Home Owners Calculation with limits:`, limits);
            const products = await HomeOwnersService.getProducts(true);
            if (!products || !products.length) {
                const single = await homeOwnersCalculator.calculate({
                    product_id: 1,
                    object_params: {},
                    limits
                });
                return { calculations: [{ product_id: 1, product_name: 'Страхование', ...single }], limits };
            }
            const calculations = [];
            for (const product of products) {
                try {
                    const result = await homeOwnersCalculator.calculate({
                        product_id: product.id,
                        object_params: {},
                        limits
                    });
                    calculations.push({
                        product_id: product.id,
                        product_name: product.name || product.title || `Продукт ${product.id}`,
                        ...result
                    });
                } catch (err) {
                    console.error(`[Flow] Calc failed for product ${product.id}:`, err.message);
                }
            }
            console.log(`[Flow] Calculation Success for ${calculations.length} product(s).`);
            return { calculations, limits };
        };

        // Если перешли на стадию расчета или получили команду принудительно
        if (cmdKey === '/homeownerscalc') {
            try {
                const { calculations, limits } = await runHomeOwnersCalculation();
                calculationResult = { calculations };
                console.log('[Flow] /homeownerscalc calculation JSON:', JSON.stringify(calculationResult, null, 2));

                if (calculations.length > 0) {
                    const tempDir = path.join(__dirname, '../../temp');
                    console.log(`[PDF Debug] __dirname: ${__dirname}`);
                    console.log(`[PDF Debug] tempDir: ${tempDir}`);
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                        console.log(`[PDF Debug] Created tempDir`);
                    }
                    const fileName = `calc_${session.id}_${Date.now()}.pdf`;
                    const tempPath = path.join(tempDir, fileName);
                    console.log(`[PDF Debug] Will write PDF to: ${tempPath}`);
                    try {
                        pdfPath = await generateHomeOwnersPdf({ calculations }, tempPath);
                        const fileExists = fs.existsSync(pdfPath);
                        console.log(`[Flow] PDF Generated: ${pdfPath}, exists: ${fileExists}`);
                    } catch (pdfErr) {
                        console.error('[Flow] PDF generation FAILED. Full error:', pdfErr.message);
                        console.error('[Flow] PDF error stack:', pdfErr.stack);
                    }
                }
            } catch (calcErr) {
                console.error('[Flow] Calculation failed:', calcErr);
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
            console.log(`[Flow] DEBUG: Command ${nextCommand ? nextCommand.command : 'null'} did not match /homeOwnersCalc or /firstRun`);
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
