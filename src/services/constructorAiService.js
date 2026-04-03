const aiService = require('./aiService');
const knex = require('../config/database');
const homeOwnersCalculator = require('../algorithms/calculators/HomeOwnersCalculator');
const HomeOwnersService = require('./HomeOwnersService');
const { generateHomeOwnersPdf } = require('../utils/pdfGenerator');
const calculationService = require('./calculationService');
const constructorPfpPersistService = require('./constructorPfpPersistService');
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

/**
 * Команды сценария, при которых вызывается calculateFirstRun.
 * В админке ключ может называться не /firstrun, а например /firstRunAIB2C — смысл тот же.
 * Плюс кастомные ключи: если в пути есть подстрока firstrun (после lower), считаем тем же сценарием.
 */
function isFirstRunCalculationCommand(cmdKey) {
    const k = (cmdKey || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!k.startsWith('/')) return false;
    if (k === '/firstrun' || k === '/firstrunaib2c' || k === '/first_run_aib2c') return true;
    return k.includes('firstrun');
}

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

function trimText(v) {
    if (v == null) return '';
    return String(v).trim();
}

/** Копия расчёта для промпта генератора: без лишней глубины, чтобы модель не «тонула» и не игнорировала блок. */
function calculationPayloadForGeneratorPrompt(calculationResult) {
    if (calculationResult == null || typeof calculationResult !== 'object') return calculationResult;
    try {
        const cloned = JSON.parse(JSON.stringify(calculationResult));
        return calculationService.simplify(cloned);
    } catch (e) {
        return calculationResult;
    }
}

/** Укороченный снимок для LLM: summary + урезанные goals (меньше токенов, выше шанс что модель прочитает). */
function compactCalculationForPresentationPrompt(calculationResult) {
    const full = calculationPayloadForGeneratorPrompt(calculationResult);
    if (full == null || typeof full !== 'object') return full;
    const goals = Array.isArray(full.goals)
        ? full.goals.map((g) => ({
              goal_name: g.goal_name || g.name,
              goal_type_id: g.goal_type_id,
              goal_id: g.goal_id,
              summary: g.summary,
          }))
        : [];
    return {
        summary: full.summary,
        goals,
        client_id: full.client_id,
        investment_expense_growth_annual_percent: full.investment_expense_growth_annual_percent,
    };
}

/**
 * Генератор: system + опционально хвост из user-сообщений.
 * Для firstRun с готовым расчётом JSON кладём во второе user-сообщение после реплики пользователя —
 * иначе модель часто игнорирует хвост огромного system и продолжает сценарий «сейчас посчитаю».
 */
function buildConstructorGeneratorPromptParts(bot, brainSection, command, calculationResult, client) {
    const sections = [];

    const cmdKeyNorm = trimText(command?.command || '').toLowerCase();
    const hasCalcPayload =
        calculationResult != null &&
        typeof calculationResult === 'object' &&
        Object.keys(calculationResult).length > 0;
    const firstRunWithCalc = isFirstRunCalculationCommand(cmdKeyNorm) && hasCalcPayload;
    const firstRunStageNoCalc = isFirstRunCalculationCommand(cmdKeyNorm) && !hasCalcPayload;

    if (firstRunWithCalc) {
        sections.push(
            'КРИТИЧЕСКИ ВАЖНО ДЛЯ ЭТОГО ОТВЕТА:\n' +
                'Финансовый план УЖЕ рассчитан на сервере. Сразу после истории диалога тебе будет отдельное пользовательское сообщение с JSON результата.\n' +
                'Твоя задача — кратко презентовать пользователю итоги из этого JSON (ключевые суммы, сроки, выводы).\n' +
                'ЗАПРЕЩЕНО: «я сейчас рассчитаю», «буквально через мгновение», «подождите», «начинаю расчёт», «сейчас посчитаю» — расчёт уже завершён.\n' +
                'Не заканчивай ответ только пересказом введённых полей; опирайся на JSON из следующего сообщения.'
        );
    }

    if (firstRunStageNoCalc) {
        sections.push(
            'ВАЖНО: На этом шаге серверный расчёт финансового плана не был получен (ошибка или нехватка данных).\n' +
                'Не обещай результат «через мгновение» и не ври про готовый расчёт. Кратко извинись и предложи повторить ответ цифрами или написать позже.'
        );
    }

    const botName = trimText(bot?.name);
    if (botName) sections.push(`Имя ассистента (настройки бота): ${botName}`);

    const base = trimText(bot?.base_brain_context);
    if (base) sections.push(`Базовый контекст бота:\n${base}`);

    const bs = trimText(brainSection);
    if (bs) sections.push(`Контексты из админки:\n${bs}`);

    const style = trimText(bot?.communication_style);
    if (style) sections.push(`Стиль общения:\n${style}`);

    const resp = command?.response != null ? String(command.response) : '';
    const cmdKey = trimText(command?.command);
    if (trimText(resp)) {
        sections.push(cmdKey ? `Сценарий (${cmdKey}):\n${trimText(resp)}` : `Сценарий:\n${trimText(resp)}`);
    }

    // JSON в system — только не firstRun (например /homeownerscalc). Иначе дублируем в user-хвосте ниже.
    if (hasCalcPayload && !firstRunWithCalc) {
        const forPrompt = calculationPayloadForGeneratorPrompt(calculationResult);
        sections.push(`Результат расчёта (JSON):\n${JSON.stringify(forPrompt, null, 2)}`);
    }

    const nick = trimText(client?.nickname);
    const uctx = trimText(client?.user_context);
    if (nick || uctx) {
        const cl = [nick ? `Никнейм: ${nick}` : null, uctx ? `Контекст: ${uctx}` : null].filter(Boolean).join('\n');
        sections.push(`Клиент:\n${cl}`);
    }

    let trailingUserCalculationJson = null;
    if (firstRunWithCalc) {
        const compact = compactCalculationForPresentationPrompt(calculationResult);
        trailingUserCalculationJson = JSON.stringify(compact, null, 2);
    }

    return {
        systemContent: sections.join('\n\n'),
        trailingUserCalculationJson,
    };
}

/** Роутер: минимальный каркас + classifier из админки (без заглушек сценария). */
function buildClassifierRouterSystemContent(commandList, currentStageKey, classifierInstructions, stayOnStageHint) {
    const lines = [
        'Выбери один ключ команды из списка. Ответ — одна строка, только ключ.',
        `Список ключей: ${commandList}`,
    ];
    if (trimText(currentStageKey)) {
        lines.push(`Текущий ключ стадии: ${trimText(currentStageKey)}`);
    }
    const instr = trimText(classifierInstructions);
    if (instr) {
        lines.push('Инструкции переключения (из админки):', instr);
    }
    if (trimText(stayOnStageHint)) {
        lines.push(`Если остаёмся на текущей стадии — ответь ключом: ${trimText(stayOnStageHint)}`);
    }
    lines.push('Без пояснений.');
    return lines.join('\n');
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
        /^(как|что|где|почему|зачем|сколько|когда|кто|здравствуй|привет|добрый|доброе|спасибо|ок|окей|да|нет|хорошо|ладно|старт|start|начать|начало|хей|hey)$/i.test(
            w0
        )
    ) {
        return false;
    }

    return true;
}

/** Сообщение явно «запуск чата» (как /start в Telegram), без вызова LLM-роутера */
function userMessageImpliesExplicitStartCommand(userMessage) {
    const t = (userMessage || '').trim().toLowerCase();
    if (!t) return false;
    if (t.includes('/start')) return true;
    if (t === 'старт' || t === 'start' || t === 'начать' || t === 'начало') return true;
    return false;
}

class ConstructorAiService {
    /**
     * Строка команды /start для генератора: сначала у этого bot_id, иначе шаблон проекта
     * (как в classifyStage — у site-бота часто нет своих копий, только is_template + project_id).
     */
    async _resolveStartCommandRow(botId) {
        const bot = await knex('constructor_bots').where('id', botId).first();
        if (!bot) return null;

        let row = await knex('constructor_commands').where({ bot_id: botId, command: '/start' }).first();
        if (!row) {
            row = await knex('constructor_commands')
                .where('bot_id', botId)
                .whereRaw('LOWER(TRIM(command)) = ?', ['/start'])
                .first();
        }
        if (!row && bot.project_id != null) {
            row = await knex('constructor_commands')
                .where({
                    is_template: true,
                    project_id: bot.project_id,
                    command: '/start',
                })
                .first();
        }
        if (!row && bot.project_id != null) {
            row = await knex('constructor_commands')
                .where({ is_template: true, project_id: bot.project_id })
                .whereRaw('LOWER(TRIM(command)) = ?', ['/start'])
                .first();
        }
        return row || null;
    }

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
        // Первый контакт: нет истории в логах И сессия ещё без стадии. Если лог не записался, но current_command_id уже
        // выставлен после прошлого хода — не залипаем в «вечном /start» без классификатора.
        const isFirstTurn = priorLogCount === 0 && session.current_command_id == null;

        if (isFirstTurn) {
            const startCmd = await this._resolveStartCommandRow(botId);
            if (startCmd) {
                console.log(
                    '[ConstructorAI Step1] Роутер LLM НЕ вызывается (первый ход): пустой лог и нет current_command_id → сразу /start.',
                    JSON.stringify({ sessionId: session.id, command: startCmd.command, commandId: startCmd.id })
                );
                if (traceStream && isConstructorAiTraceOn()) {
                    traceConstructorMeta('stream.first_turn_skip_classifier', {
                        reason:
                            'constructor_logs пуст и current_command_id null — контекст ответа из /start, роутер LLM не вызывается',
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
            console.log(
                '[ConstructorAI Step1] Первый ход, но строка /start не найдена — пойдём в classifyStage (роутер LLM).',
                JSON.stringify({ botId, sessionId: session.id })
            );
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

        // 2. Формируем контекст классификатора (строка по id может не попасть в OR-выборку — добираем из БД)
        let currentCommand = null;
        if (current_command_id) {
            currentCommand = commands.find((c) => Number(c.id) === Number(current_command_id));
            if (!currentCommand) {
                currentCommand = await knex('constructor_commands').where('id', current_command_id).first();
            }
        }

        // 1.5 Явный старт чата (/start, «старт», start…) — сразу стадия /start, без LLM
        if (!current_command_id && userMessageImpliesExplicitStartCommand(userMessage)) {
            const startCmd = findCommandByKey(commands, '/start');
            if (startCmd) {
                console.log(
                    '[ConstructorAI Step1] Роутер LLM НЕ вызывается (шорткат): явный старт чата →',
                    startCmd.command,
                    `(id=${startCmd.id})`
                );
                traceConstructorMeta('step1_classifier_shortcut', {
                    reason: 'explicit chat start (e.g. /start, старт)',
                    resolved: { id: startCmd.id, command: startCmd.command },
                });
                return startCmd;
            }
        }

        // 1.6 История для роутера (последние N ходов; текущий user — отдельным сообщением в конце промпта)
        const historyMessages = await this._loadTurnHistoryAsChatMessages(session.id, CLASSIFIER_HISTORY_LOG_ROWS);

        // На стадии /start имя или отказ → /startpfp по правилам админки, без LLM-роутера (надёжнее модели)
        if (
            currentCommand &&
            String(currentCommand.command || '').toLowerCase() === '/start' &&
            shouldForceStartpfpFromStart(userMessage)
        ) {
            const startpfp = findCommandByKey(commands, '/startpfp');
            if (startpfp) {
                console.log(
                    '[ConstructorAI Step1] Роутер LLM НЕ вызывается (шорткат): /start + имя/отказ →',
                    startpfp.command,
                    `(id=${startpfp.id})`
                );
                traceConstructorMeta('step1_classifier_shortcut', {
                    reason: '/start + имя/отказ в сообщении → /startpfp (без вызова роутера)',
                    resolved: { id: startpfp.id, command: startpfp.command },
                });
                return startpfp;
            }
        }

        const startCmdForRouter = findCommandByKey(commands, '/start');
        const classifierInstructions = currentCommand
            ? (currentCommand.classifier || '')
            : (startCmdForRouter?.classifier || '');
        const currentStageKey = currentCommand
            ? (currentCommand.command || '')
            : (startCmdForRouter ? '/start' : '');
        const stayOnStageHint = currentCommand
            ? (currentCommand.command || '')
            : (startCmdForRouter ? '/start' : '');

        const prompt = [
            {
                role: 'system',
                content: buildClassifierRouterSystemContent(
                    commandList,
                    currentStageKey,
                    classifierInstructions,
                    stayOnStageHint
                ),
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
            console.log(`[ConstructorAI Step1] Вызов роутера LLM (classifier) session=${session.id} client=${client_id} bot=${bot.id}`);
            console.log(`[AI Step 1] Client: ${client_id}, Bot: ${bot.id}`);
            console.log(`[AI Step 1] User Message: "${userMessage}"`);
            console.log(`[AI Step 1] System Prompt Instructions: ${classifierInstructions}`);

            const result = await aiService.getCompletion(prompt);

            // Очистка ответа: убираем markdown (**), кавычки, берём первое слово
            const rawTrimmed = result.trim();
            const cleaned = rawTrimmed.replace(/[."'`#*@]/g, '').trim();
            const detectedCommand = (cleaned.startsWith('/') ? cleaned : `/${cleaned}`).split(/\s+/)[0];

            console.log(`[ConstructorAI Step1] ОТВЕТ роутера LLM (raw): ${JSON.stringify(rawTrimmed)}`);
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

            console.log(
                '[ConstructorAI Step1] Итог после роутера:',
                JSON.stringify({
                    resolvedCommand: nextCommand ? nextCommand.command : null,
                    resolvedCommandId: nextCommand ? nextCommand.id : null,
                    forcedStartpfp,
                })
            );

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

        const { systemContent, trailingUserCalculationJson } = buildConstructorGeneratorPromptParts(
            bot,
            brainSection,
            command,
            calculationResult,
            client
        );

        const layeredPrompt = [];
        if (trimText(systemContent)) {
            layeredPrompt.push({ role: 'system', content: trimText(systemContent) });
        }
        layeredPrompt.push(...historyMessages, {
            role: 'user',
            content: userMessage
        });
        if (trailingUserCalculationJson) {
            layeredPrompt.push({
                role: 'user',
                content:
                    'Служебное сообщение (не показывать пользователю как цитату): расчёт УЖЕ выполнен. Ниже JSON — единственный источник цифр для ответа.\n\nРезультат расчёта (JSON):\n' +
                    trailingUserCalculationJson
            });
        }

        try {
            console.log(`[AI Step 2] Generating response for command: ${command.command}`);
            const sysMsg = layeredPrompt.find((m) => m.role === 'system');
            console.log(`[AI Step 2] System prompt: ${sysMsg ? `${sysMsg.content.length} chars` : '(none — только админка пустая)'}`);
            if (trailingUserCalculationJson) {
                console.log(`[AI Step 2] FirstRun: calculation JSON in trailing user turn (${trailingUserCalculationJson.length} chars)`);
            }

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
    async generateResponseStream(session, command, userMessage, calculationResult = null, res, streamExtras = {}) {
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

        const { systemContent, trailingUserCalculationJson } = buildConstructorGeneratorPromptParts(
            bot,
            brainSection,
            command,
            calculationResult,
            client
        );

        const layeredPrompt = [];
        if (trimText(systemContent)) {
            layeredPrompt.push({ role: 'system', content: trimText(systemContent) });
        }
        layeredPrompt.push(...historyMessages, {
            role: 'user',
            content: userMessage
        });
        if (trailingUserCalculationJson) {
            layeredPrompt.push({
                role: 'user',
                content:
                    'Служебное сообщение (не показывать пользователю как цитату): расчёт УЖЕ выполнен. Ниже JSON — единственный источник цифр для ответа.\n\nРезультат расчёта (JSON):\n' +
                    trailingUserCalculationJson
            });
        }

        traceConstructorMeta('step2_generator_context', {
            sessionId: session.id,
            botId: bot.id,
            projectId: bot.project_id,
            commandForLayer3: command.command || '(synthetic empty)',
            commandId: command.id != null ? command.id : null,
            layer3ResponsePreview: truncateTraceText(command.response || '', 2000),
            historyTurnsInPrompt: historyMessages.length / 2,
            systemPromptChars: trimText(systemContent).length,
            hasCalculationJson: !!calculationResult,
            firstRunJsonInTrailingUser: !!trailingUserCalculationJson,
            trailingUserJsonChars: trailingUserCalculationJson ? trailingUserCalculationJson.length : 0,
        });
        traceConstructorMessages('step2_generator_llm_request_stream', layeredPrompt);

        // Сайт-чат: нормализованный SSE (type=text|done), не сырой OpenRouter — иначе фронт рисует [DONE] и JSON-чанки
        const streamOpts = { sseFormat: 'pfp' };
        if (streamExtras.trailingSsePayload != null) {
            streamOpts.trailingSsePayload = streamExtras.trailingSsePayload;
        }
        const fullText = await aiService.streamCompletion(layeredPrompt, null, res, streamOpts);

        traceConstructorMeta('step2_generator_llm_response_stream_done', {
            fullTextChars: (fullText || '').length,
            fullTextPreview: truncateTraceText(fullText || '', 1200),
        });

        const suffix = streamExtras.appendToFullText || '';
        return suffix ? `${fullText || ''}${suffix}` : fullText;
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

        // Актуальная сессия из БД (после прошлого хода должен быть current_command_id)
        session = await knex('constructor_sessions').where('id', session.id).first();

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

        // Стадию фиксируем сразу после роутера, чтобы следующий запрос видел current_command_id даже если стрим/лог упадут позже.
        if (nextCommand && nextCommand.id != null) {
            await knex('constructor_sessions').where('id', session.id).update({
                current_command_id: nextCommand.id,
                updated_at: knex.fn.now()
            });
            session = { ...session, current_command_id: nextCommand.id };
        }

        const cmdKey = nextCommand ? nextCommand.command.trim().toLowerCase() : '';

        let calculationResult = null;
        let pdfPath = null;
        let firstRunExtraction = null;

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
        } else if (isFirstRunCalculationCommand(cmdKey)) {
            firstRunExtraction = await this.extractFinancialPlanParams(session, userMessage);
            try {
                const calcData = {
                    client: {
                        ...client,
                        ...firstRunExtraction.client,
                        project_id: bot.project_id
                    },
                    goals: firstRunExtraction.goals || []
                };
                calculationResult = await calculationService.calculateFirstRun(calcData, null, null, {
                    isFirstRun: true,
                    usePool: true,
                });
            } catch (calcErr) {
                console.error('[Flow] FirstRun Calculation failed:', calcErr);
            }
            console.log(
                `[ConstructorAI] firstRun(stream): cmdKey=${cmdKey} hasCalc=${!!calculationResult} goalsInExtraction=${Array.isArray(firstRunExtraction?.goals) ? firstRunExtraction.goals.length : 'n/a'}`
            );
        }

        let pfpReportPdfUrl = null;
        if (isFirstRunCalculationCommand(cmdKey) && calculationResult && firstRunExtraction) {
            try {
                const r = await constructorPfpPersistService.persistConstructorFirstRunAndUploadPdf({
                    constructorClientRow: client,
                    bot,
                    extraction: firstRunExtraction,
                    calculationResponse: calculationResult,
                });
                pfpReportPdfUrl = r.pdfUrl;
            } catch (persistErr) {
                console.error('[ConstructorAI] persistConstructorFirstRun (stream) failed:', persistErr.message || persistErr);
            }
        }

        const pdfSuffix = pfpReportPdfUrl ? `\n\n📄 Ваш персональный отчёт (PDF): ${pfpReportPdfUrl}` : '';
        // 2) Стриминг ответа
        const responseText = await this.generateResponseStream(
            session,
            nextCommand || { response: '' },
            userMessage,
            calculationResult,
            res,
            {
                trailingSsePayload: pfpReportPdfUrl ? { type: 'pdf_url', pdf_url: pfpReportPdfUrl } : null,
                appendToFullText: pdfSuffix,
            }
        );

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
        session = await knex('constructor_sessions').where('id', session.id).first();
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

        if (nextCommand && nextCommand.id != null) {
            await knex('constructor_sessions').where('id', session.id).update({
                current_command_id: nextCommand.id,
                updated_at: knex.fn.now()
            });
            session = { ...session, current_command_id: nextCommand.id };
        }

        let calculationResult = null;
        let pdfPath = null;
        let firstRunExtraction = null;

        // Нормализация команды для сравнения (убираем регистр и пробелы)
        const cmdKey = nextCommand ? nextCommand.command.trim().toLowerCase() : '';
        console.log(
            `[Flow] Command for this turn: "${nextCommand ? nextCommand.command : 'null'}" (cmdKey: ${cmdKey}); will run calculation: ${cmdKey === '/homeownerscalc' || isFirstRunCalculationCommand(cmdKey)}`
        );

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
        } else if (isFirstRunCalculationCommand(cmdKey)) {
            console.log(`[Flow] DEBUG: first-run calculation command (${cmdKey}). Starting extraction...`);
            firstRunExtraction = await this.extractFinancialPlanParams(session, userMessage);
            console.log(`[Flow] Performing Full Financial Plan Calculation for client:`, client.nickname);
            console.log(`[Flow] Extraction Result:`, JSON.stringify(firstRunExtraction, null, 2));

            try {
                // Подготавливаем данные для calculationService
                const calcData = {
                    client: {
                        ...client,
                        ...firstRunExtraction.client,
                        project_id: bot.project_id
                    },
                    goals: firstRunExtraction.goals || []
                };

                console.log('[Flow] DEBUG: Calling calculationService.calculateFirstRun with:', JSON.stringify(calcData, null, 2));
                calculationResult = await calculationService.calculateFirstRun(calcData, null, null, {
                    isFirstRun: true,
                    usePool: true,
                });
                console.log(`[Flow] FirstRun Calculation Success. Total Capital: ${calculationResult.summary?.total_capital}`);
            } catch (calcErr) {
                console.error('[Flow] FirstRun Calculation failed:', calcErr);
            }
            console.log(
                `[ConstructorAI] firstRun(telegram): cmdKey=${cmdKey} hasCalc=${!!calculationResult} goalsInExtraction=${Array.isArray(firstRunExtraction?.goals) ? firstRunExtraction.goals.length : 'n/a'}`
            );
        } else {
            console.log(
                `[Flow] DEBUG: Command ${nextCommand ? nextCommand.command : 'null'} did not match /homeownerscalc or first-run keys (/firstrun, /firstRunAIB2C, …)`
            );
        }

        let pfpReportPdfUrl = null;
        if (isFirstRunCalculationCommand(cmdKey) && calculationResult && firstRunExtraction) {
            try {
                const r = await constructorPfpPersistService.persistConstructorFirstRunAndUploadPdf({
                    constructorClientRow: client,
                    bot,
                    extraction: firstRunExtraction,
                    calculationResponse: calculationResult,
                });
                pfpReportPdfUrl = r.pdfUrl;
            } catch (persistErr) {
                console.error('[ConstructorAI] persistConstructorFirstRun failed:', persistErr.message || persistErr);
            }
        }

        // 2. Генерация ответа
        let responseText = await this.generateResponse(session, nextCommand, userMessage, calculationResult);
        if (pfpReportPdfUrl) {
            responseText = `${responseText}\n\n📄 Ваш персональный отчёт (PDF): ${pfpReportPdfUrl}`;
        }

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
