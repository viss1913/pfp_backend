const aiService = require('./aiService');
const knex = require('../config/database');
const homeOwnersCalculator = require('../algorithms/calculators/HomeOwnersCalculator');
const HomeOwnersService = require('./HomeOwnersService');
const { generateHomeOwnersPdf } = require('../utils/pdfGenerator');
const calculationService = require('./calculationService');
const constructorPfpPersistService = require('./constructorPfpPersistService');
const clientService = require('./clientService');
const goalRecalculator = require('../algorithms/recalculators');
const { syncCalculationGoalsWithDatabase } = require('./clientGoalSyncService');
const path = require('path');
const fs = require('fs');

/** Полный трейс цепочки «классификатор → генератор»: `CONSTRUCTOR_AI_TRACE=0` выкл., иначе вкл. */
function isConstructorAiTraceOn() {
    return process.env.CONSTRUCTOR_AI_TRACE !== '0';
}

/** В трейсе сообщений LLM: `CONSTRUCTOR_AI_TRACE_CONTENT=0` — только index/role/длина, без текста (меньше каши в логах). */
function isConstructorTraceWithMessageBodies() {
    const v = (process.env.CONSTRUCTOR_AI_TRACE_CONTENT || '1').trim().toLowerCase();
    return v !== '0' && v !== 'false' && v !== 'no';
}

function isConstructorDocContextEnabled() {
    const v = (process.env.CONSTRUCTOR_DOC_CONTEXT_ENABLED || 'false').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function isConstructorDocDebugOn() {
    const v = (process.env.CONSTRUCTOR_DOC_DEBUG || 'false').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
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
    const withBodies = isConstructorTraceWithMessageBodies();
    const parts = messages.map((m, i) => {
        const row = {
            index: i,
            role: m.role,
            contentChars: (m.content || '').length,
        };
        if (withBodies) {
            row.content = truncateTraceText(m.content || '', TRACE_MAX_CONTENT);
        }
        return row;
    });
    console.log(
        `[ConstructorAI::TRACE] ${step} (${messages.length} msgs${withBodies ? '' : ', bodies off CONSTRUCTOR_AI_TRACE_CONTENT=0'})\n${JSON.stringify(parts, null, 2)}`
    );
}

function traceConstructorMeta(step, obj) {
    if (!isConstructorAiTraceOn()) return;
    console.log(`[ConstructorAI::TRACE] ${step} ${JSON.stringify(obj, null, 2)}`);
}

/** Один data: JSON ивент для site-chat SSE (после session/classifier). Не бросает. */
function writeConstructorSiteChatSseData(res, payload) {
    if (!res || typeof res.write !== 'function' || res.writableEnded) return false;
    try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        return true;
    } catch (e) {
        console.warn('[ConstructorAI] site-chat SSE write failed:', e.message || e);
        return false;
    }
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
 * Важно: /first_run и /first-run НЕ содержат подстроку «firstrun» (мешает _), без этого теста расчёт и стоп без calc не срабатывают.
 */
function isFirstRunCalculationCommand(cmdKey) {
    const k = (cmdKey || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!k.startsWith('/')) return false;
    if (k === '/firstrun' || k === '/firstrunaib2c' || k === '/first_run_aib2c') return true;
    if (k.includes('firstrun')) return true;
    const slug = k.slice(1).replace(/-/g, '_');
    return slug.includes('first_run');
}

function isCalcRecalculateCommand(cmdKey) {
    const k = (cmdKey || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!k.startsWith('/')) return false;
    return k === '/calc' || k === '/recalc' || k === '/recalculate';
}

const DEFAULT_RECALCULATE_EXTRACTION_SYSTEM_PROMPT = [
    'Ты извлекаешь JSON для пересчёта существующей цели финансового плана.',
    'Верни ТОЛЬКО JSON без markdown и комментариев.',
    'Схема ответа:',
    '{',
    '  "target_goal": { "id": 0, "goal_type_id": 0, "name": "" },',
    '  "goal_patch": { ... },',
    '  "client_patch": { ... },',
    '  "needs_clarification": false,',
    '  "clarification_question": ""',
    '}',
    'Правила:',
    '- если точно понятен id цели, укажи target_goal.id;',
    '- если id неясен, заполни goal_type_id/name и needs_clarification=true;',
    '- в goal_patch и client_patch клади только поля, которые пользователь поменял;',
    '- числа отдавай числами, не строками.',
    '',
    'Пенсия / госпенсия (goal_type_id 1):',
    '- текущий ИПК (баллы) — в goal_patch.ipk_current или client_patch.ipk_current (если явно про «мой ИПК в ПФР»);',
    '- накопления на ОПС (руб.) — в первую очередь goal_patch.ops_capital (в client_patch тоже можно — сервер перенесёт в цель);',
    '- желаемая пенсия в месяц — goal_patch.desired_monthly_income или target_amount (числа в «сегодняшних» рублях, как в цели).',
].join('\n');

/** Текст без LLM, если first run без успешного расчёта (нельзя выдумывать цифры). */
const FIRST_RUN_CALC_FAILED_USER_MESSAGE =
    'Сейчас не удалось выполнить расчёт финансового плана на сервере. Без готового расчёта я не показываю суммы и рекомендации — иначе это будут не цифры из модели, а фантазия.\n\n' +
    'Проверьте, что в диалоге есть: доход в месяц (руб.), дата рождения или возраст, пол, накопления и параметры цели (для пенсии — желаемый пенсионный доход в месяц; для квартиры — стоимость и взнос при наличии). ' +
    'Напишите данные ещё раз одним сообщением или начните сначала.';

/**
 * Цель считается успешно посчитанной только если нет error и есть объект summary от калькулятора.
 * Иначе (!error но пустая структура) firstRunCalculationSucceeded был бы true — генератор получал бы слабый JSON, а модель додумывала бы цифры из чата.
 */
function firstRunGoalHasUsableCalc(g) {
    if (!g || typeof g !== 'object') return false;
    if (g.error) return false;
    return g.summary != null && typeof g.summary === 'object';
}

/** Есть хотя бы одна цель с реальным результатом калькулятора (summary), не только «без error». */
function firstRunCalculationSucceeded(calculationResult) {
    if (!calculationResult || typeof calculationResult !== 'object') return false;
    const goals = calculationResult.goals;
    if (!Array.isArray(goals) || goals.length === 0) return false;
    return goals.some(firstRunGoalHasUsableCalc);
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

/** Дефолтный system-промпт экстракции JSON (first run): data/prompts/financialExtractionFirstRun.txt */
function loadDefaultFinancialExtractionSystemPrompt() {
    const promptPath = path.join(__dirname, '..', '..', 'data', 'prompts', 'financialExtractionFirstRun.txt');
    try {
        const text = fs.readFileSync(promptPath, 'utf8');
        const t = text.trim();
        if (t) return t;
    } catch (e) {
        console.warn('[ConstructorAI] Could not read financialExtractionFirstRun.txt:', e.message);
    }
    return [
        'Ты извлекаешь из диалога только JSON с ключами client и goals для расчёта first run.',
        'Обязательно client.sex: male или female; client.total_liquid_capital — число; goals с goal_type_id и суммами.',
        'Ответ — один JSON-объект, без markdown.',
    ].join('\n');
}

const DEFAULT_FINANCIAL_EXTRACTION_SYSTEM_PROMPT = loadDefaultFinancialExtractionSystemPrompt();

const EXTRACT_FINANCIAL_PLAN_PARAMS_COMMAND = '/extractFinancialPlanParams';

/**
 * Команды бота + шаблоны проекта (тот же запрос, что в classifyStage).
 * @returns {Promise<object[]>}
 */
async function loadConstructorCommandsForBot(botId) {
    const bot = await knex('constructor_bots').where('id', botId).first();
    if (!bot) return [];
    return knex('constructor_commands')
        .where('bot_id', bot.id)
        .orWhere(function () {
            this.where('is_template', true).andWhere('project_id', bot.project_id);
        })
        .orderByRaw('bot_id DESC, is_template ASC');
}

/**
 * System-промпт для extractFinancialPlanParams: поле response команды /extractFinancialPlanParams или дефолт.
 * @returns {Promise<{ content: string, source: 'custom'|'default', commandId: number|null }>}
 */
async function resolveFinancialExtractionSystemPrompt(botId) {
    const commands = await loadConstructorCommandsForBot(botId);
    const row = findCommandByKey(commands, EXTRACT_FINANCIAL_PLAN_PARAMS_COMMAND);
    const custom = row && trimText(row.response);
    if (custom) {
        return { content: row.response.trim(), source: 'custom', commandId: row.id != null ? Number(row.id) : null };
    }
    return { content: DEFAULT_FINANCIAL_EXTRACTION_SYSTEM_PROMPT, source: 'default', commandId: null };
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

/** Расшифровка полей summary цели «пенсия» для генератора текста (без дублирования сырых JSON). */
const PENSION_PRESENTATION_FIELD_HELP_RU = {
    target_amount_initial:
        'Желаемый размер пенсии в месяц **в сегодняшних ценах** (постоянные цены, сопоставимо с сегодняшним рублём); для озвучивания пользователю.',
    projected_pension_monthly_present:
        'Желаемый пенсионный доход в месяц в текущих рублях по модели (часто совпадает с target_amount_initial).',
    target_amount_future:
        'Тот же желаемый доход, выраженный в номинальных рублях к году выхода на пенсию (с учётом инфляции в сценарии).',
    projected_pension_monthly_future:
        'Желаемый доход в месяц в номинале к пенсии (будущие рубли).',
    state_pension_monthly_today:
        'Ожидаемая страховая (государственная) пенсия в месяц **в сегодняшних ценах** по упрощённой модели (детали — в PDF отчёта).',
    state_pension_monthly_future:
        'Ожидаемая госпенсия в месяц к году выхода, в номинальных рублях.',
    pension_gap_future:
        'Дополнительный доход в месяц в будущем (номинал), который нужно обеспечить самостоятельно: разрыв между желаемой пенсией и госпенсией к выходу.',
    initial_capital:
        'Уже внесённый / учтённый стартовый капитал по этой цели (не путать с target_amount_initial — это не желаемая пенсия).',
    monthly_replenishment:
        'Рекомендованный ежемесячный взнос с следующего периода по результатам расчёта.',
    projected_capital_at_retirement:
        'Прогноз накоплений к выходу на пенсию с учётом взносов, доходности, софинансирования и налоговых эффектов в модели.',
    required_capital_at_retirement:
        'Теоретически необходимый капитал к пенсии для закрытия разрыва (по методике калькулятора); может быть близок к projected_capital_at_retirement.',
    inflation_rate: 'Годовая инфляция, заложенная в сценарии (%).',
    accumulation_yield_percent: 'Ожидаемая доходность на этапе накопления (% годовых).',
    payout_yield_percent: 'Ожидаемая доходность на этапе выплат (% годовых).',
    total_tax_benefit: 'Суммарная налоговая выгода (вычеты) по цели в модели.',
    total_cofinancing: 'Софинансирование (госпрограммы), учтённое в расчёте.',
    ipk_current:
        'ИПК, заложенный в оценку госпенсии (часто совпадает с goals[].state_pension_details_for_ai.ipk_current). Подробная трактовка — в pension_state_pension_glossary_ru и PDF.',
    status:
        'OK — рекомендованное ежемесячное пополнение не превышает ~20% от дохода клиента в модели; GAP — выше порога, в тексте мягко предупредить о нагрузке на бюджет.',
    target_months: 'Срок до выхода на пенсию в месяцах (горизонт накопления в симуляции).',
    initial_capital_ops:
        'Стартовый капитал, отнесённый к накопительной пенсии (ОПС) по вводу; суммируется с взносами по программе в логике калькулятора.',
};

/**
 * Расшифровка блока упрощённой модели страховой пенсии (как в PensionCalculator.calculateStatePension).
 * Цифры в goals[].state_pension_details_for_ai; сырые законы/индексация не воспроизводить — отсылка к PDF.
 */
const PENSION_STATE_PENSION_MODEL_GLOSSARY_RU = {
    ipk_total:
        'Прогноз суммарного индивидуального пенсионного коэффициента (ИПК) к году выхода на пенсию: ipk_current + ipk_forecast. Основа расчёта ожидаемой страховой пенсии в модели.',
    ipk_current:
        'ИПК «уже сформированный»: из ввода по цели/клиенту, если задан; иначе оценка из упрощённой модели прошлых взносов (не выписка из СФР).',
    ipk_forecast:
        'Ожидаемое начисление баллов за оставшиеся годы до пенсии при текущем доходе, лимите базы и ставке взносов в сценарии (упрощённо).',
    point_cost_today:
        'Стоимость одного пенсионного балла в рублях в ценах «сегодня» (параметр настроек проекта / сценария, не курс ЦБ).',
    point_cost_future:
        'Стоимость балла к году выхода на пенсию в номинальных рублях (индексация по инфляции сценария).',
    fixed_payment_today:
        'Фиксированная выплата к страховой пенсии, руб/мес в ценах «сегодня» (параметр модели, аналог фиксированной части ФЗ).',
    fixed_payment_future:
        'Та же фиксированная выплата в номинале к году пенсии (с индексацией по инфляции сценария).',
    retirement_age:
        'Возраст выхода на страховую пенсию в этой модели (зависит от пола и правил, заложенных в калькулятор).',
    retirement_year: 'Календарный год выхода на пенсию в расчёте (дата рождения + возраст выхода).',
    years_to_pension: 'Полных лет от даты расчёта до года выхода на пенсию в модели.',
    formula_hint:
        'Упрощённая связка для озвучивания: ожидаемая госпенсия в номинале к пенсии ≈ ipk_total × point_cost_future + fixed_payment_future (в руб/мес); в «сегодняшних» деньгах см. state_pension_monthly_today в summary цели. Точные допущения и таблицы — в PDF.',
};

const PASSIVE_INCOME_FIELD_GLOSSARY_RU = {
    target_amount_initial:
        'Оценка желаемого пассивного дохода в месяц в «сегодняшних» рублях (может пересчитаться, если задано фиксированное monthly_replenishment — см. калькулятор).',
    target_amount_future:
        'Желаемый пассивный доход в месяц к концу срока цели в номинальных рублях (с инфляцией сценария). Не путать с lump-sum целью.',
    required_capital_at_end:
        'Капитал, который нужно накопить к концу срока, чтобы при payout_yield_percent получать желаемый доход.',
    projected_capital_at_end: 'Прогноз фактического капитала к концу срока при выбранных взносах и доходности.',
    payout_yield_percent: 'Доходность на фазе выплат (пассив с капитала), % годовых из настроек.',
    accumulation_yield_percent: 'Средневзвешенная доходность портфеля на фазе накопления.',
    target_months: 'Срок цели в месяцах.',
    status: 'OK/GAP — нагрузка на бюджет относительно ~20% от дохода (как в пенсии).',
    inflation_rate: 'Инфляция сценария для индексации желаемого дохода.',
};

const PASSIVE_INCOME_NARRATIVE_HINTS_RU = [
    'Пассивный доход: опирайся на target_amount_initial / target_amount_future и projected_capital_at_end vs required_capital_at_end.',
    'Портфель для озвучивания названия — goals[].portfolio_snapshot_for_ai; детали инструментов — в PDF.',
];

const INVESTMENT_FIELD_GLOSSARY_RU = {
    projected_capital_at_end: 'Прогноз капитала к концу срока при заданных взносах, доходности и налоговых/ПДС эффектах.',
    monthly_replenishment: 'Ежемесячное пополнение (как в вводе цели; может быть 0).',
    target_months: 'Горизонт инвестирования в месяцах.',
    accumulation_yield_percent: 'Ожидаемая доходность портфеля на горизонте цели.',
    total_tax_benefit: 'Налоговый эффект (вычеты) по модели.',
    total_cofinancing: 'Софинансирование, если применимо.',
    status: 'В инвестициях часто OK; смысл уточнять по сценарию бота.',
};

const INVESTMENT_NARRATIVE_HINTS_RU = [
    'Инвестиции / «накопить и приумножить»: фокус на projected_capital_at_end, взносах и горизонте; не обещать гарантированную доходность.',
    'Сумма «цели» из ввода может не дублироваться в summary — не выдумывать целевой капитал, если его нет в JSON.',
];

const OTHER_GOAL_FIELD_GLOSSARY_RU = {
    target_amount_initial: 'Целевая сумма (квартира, образование и т.д.) в ценах «сегодня».',
    target_amount_future: 'Та же цель в номинале к дате достижения с учётом инфляции сценария.',
    projected_capital_at_end: 'Прогноз накоплений к концу срока.',
    initial_capital: 'Стартовый капитал по цели.',
    monthly_replenishment: 'Рекомендованный ежемесячный взнос.',
    target_months: 'Срок в месяцах.',
    inflation_rate: 'Инфляция для дисконтирования/роста цели.',
    accumulation_yield_percent: 'Доходность портфеля «прочей» цели.',
    status: 'OK — прогноз капитала достигает цели; GAP — может не хватить, мягко подсветить.',
};

const OTHER_GOAL_NARRATIVE_HINTS_RU = [
    'Прочая цель (дом, авто, крупная покупка): связка target_amount_* ↔ projected_capital_at_end и пополнения.',
    'goal_type в ответе может быть OTHER / кастомное имя из ввода — ориентируйся на goal_name.',
];

/** Презентация firstRun в чате для цели «Квартира» (OTHER, goal_type_id 4, name «Квартира»). */
const OTHER_GOAL_APARTMENT_PRESENTATION_STRUCTURE_RU = [
    'Цель «Квартира» (OTHER): тон — про жильё и накопление на первый взнос/полную стоимость, без канцелярита.',
    '1) Стоимость квартиры **в сегодняшних ценах**: target_amount_initial в summary цели (это ввод пользователя, не прогноз капитала).',
    '2) Срок плана в модели: target_months месяцев — уже согласован с полом и возрастом на бэке; не придумывай другой горизонт.',
    '3) Что уже отложено на цель: initial_capital; рекомендуемое ежемесячное пополнение: monthly_replenishment.',
    '4) Итог: projected_capital_at_end к концу срока vs цель в номинале target_amount_future (с инфляцией сценария) — хватает или нет; status OK или GAP.',
    '5) Налоги и льготы — по plan_tax_narrative_hints_ru, если в расчёте есть выгоды по ПДС; иначе коротко или пропусти.',
    'Формулировки: «по модели расчёта», «прогноз»; не обещай гарантированную доходность.',
];

const OTHER_GOAL_APARTMENT_NARRATIVE_HINTS_RU = [
    'Следуй other_goal_apartment_presentation_structure_ru; поля — other_goal_field_glossary_ru; имя цели в JSON — goal_name.',
    'Не путай target_amount_initial (цена «сегодня») с projected_capital_at_end (что успеваем накопить по модели).',
    'При GAP — мягко про нагрузку на бюджет или необходимость скорректировать взнос/ожидания, без давления.',
];

const LIFE_INSURANCE_FIELD_GLOSSARY_RU = {
    target_coverage: 'Запрашиваемая сумма страхового покрытия / лимит по программе (упрощённо).',
    target_amount_initial: 'Дублирует покрытие или премию в зависимости от API; сверяй с target_coverage и details.',
    target_amount_future: 'Часто равно покрытию; в номинале без отдельной индексации, если так в расчёте.',
    expected_cash_value: 'Ожидаемая накопительная / плановая величина по данным НСЖ-модели (не депозит).',
    initial_capital: 'Первый взнос / стартовая премия, попадающая в капитал цели.',
    monthly_replenishment: 'При fallback-модели — оценка ежемесячного взноса; при API может не использоваться.',
    premium_frequency: 'once | monthly | annual — как задан график премий.',
    investment_yield_percent: 'Условная доходность/учёт в продукте (заглушка или из API).',
    total_tax_benefit: 'Суммарный налоговый вычет по НСЖ за срок, если рассчитан.',
};

const LIFE_INSURANCE_DETAILS_GLOSSARY_RU = {
    program_name: 'Название программы страхования / НСЖ.',
    annual_premium: 'Годовая премия по расчёту партнёра или fallback.',
    tax_deduction_2026: 'Вычет НСЖ в оценке на 2026 год (упрощённая налоговая модель).',
    total_tax_deductions: 'Сумма вычетов за весь срок (оценка).',
    risks_for_ai: 'Укороченный список рисков с лимитами — для текста; полный график в PDF.',
};

const LIFE_INSURANCE_NARRATIVE_HINTS_RU = [
    'НСЖ: покрытие, премия, периодичность; налоговый эффект осторожно («по модели расчёта»). Риски — из life_details_for_ai.risks_for_ai.',
    'Если был сбой API, в расчёте мог быть fallback — не гарантировать условия партнёра без оговорки.',
];

const FIN_RESERVE_FIELD_GLOSSARY_RU = {
    target_amount_initial: 'Обычно целевая «подушка» или ориентир на старте (из ввода).',
    target_amount_future: 'Прогноз баланса к концу срока (накопления + доходность).',
    projected_capital_at_end: 'Итоговый капитал подушки к концу горизонта.',
    monthly_replenishment: 'Ежемесячное пополнение подушки (если есть).',
    target_months: 'Горизонт резерва (часто 12 мес).',
    accumulation_yield_percent: 'Доходность консервативного портфеля подушки.',
};

const FIN_RESERVE_NARRATIVE_HINTS_RU = [
    'Финансовая подушка: срок, пополнения, итоговый projected_capital_at_end; без агрессивных обещаний доходности.',
];

const RENT_FIELD_GLOSSARY_RU = {
    initial_capital: 'Капитал, от которого считается «арендный» доход в модели (доля портфеля «аренда»).',
    projected_monthly_income: 'Ожидаемый доход в месяц от этого капитала по ставке payout_yield_percent.',
    payout_yield_percent: 'Годовая доходность сценария для расчёта месячного дохода.',
};

const RENT_NARRATIVE_HINTS_RU = [
    'Аренда / рентный доход: initial_capital → projected_monthly_income при заданной доходности; детали портфеля в snapshot/PDF.',
];

/** Подсказка ИИ: сопоставление goal_type_id из JSON и смысла цели. */
const GOAL_TYPE_ID_LABELS_RU = {
    1: 'Пенсия',
    2: 'Пассивный доход',
    3: 'Инвестиции / накопление капитала',
    4: 'Прочая цель (OTHER): квартира, авто, крупная покупка и т.п.; для сценария B2C «Квартира» — строго name «Квартира»',
    5: 'Страхование жизни / НСЖ',
    6: 'Прочая цель (альтернативный тип в БД)',
    7: 'Финансовая подушка / резерв',
    8: 'Рентный доход (доходность с капитала «как аренда»)',
    9: 'Прочая цель (альтернативный тип в БД)',
};

/** Поля summary каждой цели: налоги и софинансирование (всегда с firstRun для ИИ). */
const GOAL_SUMMARY_TAX_GLOSSARY_RU = {
    total_tax_benefit:
        'По этой цели: оценка налогового эффекта (вычет/возврат НДФЛ и т.п.) в модели PFP; для ПДС-продуктов копит симуляция, для НСЖ может отражать вычеты по страхованию. Не налоговая консультация.',
    total_cofinancing:
        'По этой цели: суммарное государственное софинансирование (доплата государства в программу), если заложено в сценарии ПДС/программы.',
};

/**
 * Верхний summary плана: tax_benefits_summary из calculateFirstRun (_generateTaxBenefitsSummary).
 * Пояснения для ИИ, чтобы не путать ПДС, НСЖ, годовые итоги и вычет за 2026.
 */
const PLAN_TAX_AND_STATE_BENEFITS_GLOSSARY_RU = {
    'summary.total_state_benefit':
        'Сводная оценка «государственных выгод» по всему плану: налоговые вычеты/возвраты плюс софинансирование (агрегат модели). Обычно согласуется с tax_benefits_summary.totals.total_state_benefits.',
    'summary.tax_benefits_summary':
        'Раздельный учёт: pds_benefits (ПДС, ИИС, накопительные программы с вычетом и софинансированием) и nsj_benefits (НСЖ / страхование жизни).',
    'tax_benefits_summary.pds_benefits.deduction_2026':
        'Оценка налогового выгоды (возврат/вычет), отнесённой к 2026 году по потокам ПДС; заполняется из yearly_breakdown в расчёте — если в промпте разбивка убрана, может быть 0 без означания отсутствия льгот навсегда.',
    'tax_benefits_summary.pds_benefits.cofinancing_2026':
        'Софинансирование по ПДС-программам в 2026 году (оценка модели).',
    'tax_benefits_summary.pds_benefits.total_deductions':
        'Суммарная оценка налоговых вычетов/возвратов по всем ПДС-целям за горизонт плана.',
    'tax_benefits_summary.pds_benefits.total_cofinancing':
        'Суммарное софинансирование по ПДС-целям за горизонт плана.',
    'tax_benefits_summary.nsj_benefits.annual_premium':
        'Годовая премия по программе НСЖ (из цели LIFE), используется в оценке вычетов.',
    'tax_benefits_summary.nsj_benefits.deduction_2026':
        'Оценка вычета по НСЖ на 2026 год (упрощённая модель НДФЛ внутри PFP).',
    'tax_benefits_summary.nsj_benefits.total_deductions':
        'Суммарная оценка вычетов по НСЖ за срок, учтённая в агрегаторе.',
    'tax_benefits_summary.totals.deduction_2026':
        'ПДС + НСЖ: суммарная оценка вычета/возврата, привязанная к 2026 году.',
    'tax_benefits_summary.totals.cofinancing_2026':
        'Софинансирование за 2026 год (в основном из ПДС).',
    'tax_benefits_summary.totals.total_deductions':
        'Все налоговые выгоды по плану (ПДС + НСЖ), номинал по модели.',
    'tax_benefits_summary.totals.total_cofinancing':
        'Всё софинансирование по плану.',
    'tax_benefits_summary.totals.total_state_benefits':
        'Вычеты плюс софинансирование одной суммой (эквивалент «всего господдержки» в цифрах модели).',
};

const PLAN_TAX_NARRATIVE_HINTS_RU = [
    'ОБЯЗАТЕЛЬНО в ЭТОМ ЖЕ ответе: блок про налоги и льготы сразу, не вопросом в конце. Источник — summary.tax_benefits_summary, summary.total_state_benefit; по целям — goals[].summary.total_tax_benefit и total_cofinancing; НСЖ — life_details_for_ai.',
    'БЕЗ ДУБЛЯ: если цель одна (summary.goals_count === 1) или суммы по цели совпадают с итогом плана — озвучь налоги один раз: либо только сводку по плану, либо только по цели с фразой вроде «по единственной цели это же самое, что итог по плану». Не повторяй те же цифры в двух подпунктах.',
    'Формулировки: «по модели расчёта», «оценка», «не налоговая консультация»; не обещай гарантированный возврат от государства.',
    'ПДС (pds_benefits) vs NSJ (nsj_benefits) — кратко, если в плане есть оба типа; иначе достаточно totals.',
    'Если deduction_2026 нулевой — не утверждать, что льгот нет; разбивка может быть в PDF.',
    'В конце ответа одна короткая строка: при необходимости деталей и таблиц — см. PDF-отчёт (если он выдаётся пользователю).',
];

function estimateAgeYearsFromBirthDate(isoDate) {
    const s = trimText(isoDate);
    if (!s) return null;
    const b = new Date(s);
    if (Number.isNaN(b.getTime())) return null;
    const diff = Date.now() - b.getTime();
    return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
}

/** Полных лет на дату ref (календарно), для правил горизонта ПДС / INVESTMENT. */
function ageFullYearsAtReference(isoBirth, ref = new Date()) {
    const b = new Date(trimText(isoBirth));
    if (!trimText(isoBirth) || Number.isNaN(b.getTime())) return null;
    const r = ref instanceof Date && !Number.isNaN(ref.getTime()) ? ref : new Date();
    let years = r.getFullYear() - b.getFullYear();
    const md = r.getMonth() - b.getMonth();
    if (md < 0 || (md === 0 && r.getDate() < b.getDate())) years -= 1;
    return years;
}

/**
 * Горизонт в годах по полу и возрасту (ПДС / «Сохранить и приумножить» / B2C «Квартира»).
 * Муж: возраст ≤ 45 → 15 лет; иначе max(10, 60 − возраст).
 * Жен: возраст ≤ 40 → 15 лет; иначе max(10, 55 − возраст).
 */
function computePdsInvestmentHorizonYears(sex, ageFullYears) {
    if (ageFullYears == null || ageFullYears < 0) return null;
    const s = String(sex || '').toLowerCase();
    const male = s === 'male' || s === 'm' || s === 'мужской';
    const female = s === 'female' || s === 'f' || s === 'женский';
    if (!male && !female) return null;
    if (male) {
        if (ageFullYears <= 45) return 15;
        return Math.max(10, 60 - ageFullYears);
    }
    if (ageFullYears <= 40) return 15;
    return Math.max(10, 55 - ageFullYears);
}

/** Нормализация пола для горизонта ПДС/квартиры и calculateFirstRun (male|female). */
function inferCanonicalSex(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim().toLowerCase();
    if (s === 'male' || s === 'm' || s === 'мужской') return 'male';
    if (s === 'female' || s === 'f' || s === 'женский') return 'female';
    return null;
}

/**
 * Экстрактор иногда пишет 1886-01-01 вместо 1986-01-01 (возраст «40» при опорном 2026).
 * Если год в 1870–1899 и по дате получается ≥100 лет, а при +100 к году — правдоподобный возраст, подменяем.
 */
function fixLikelyMissingCenturyInBirthDate(isoBirth, ref = new Date()) {
    const s = trimText(isoBirth);
    if (!s) return s;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    const y = parseInt(m[1], 10);
    if (!Number.isFinite(y) || y < 1870 || y > 1899) return s;
    const ymd = `${m[1]}-${m[2]}-${m[3]}`;
    const ageWrong = ageFullYearsAtReference(ymd, ref);
    if (ageWrong == null || ageWrong < 100) return s;
    const yFixed = y + 100;
    const candidate = `${yFixed}-${m[2]}-${m[3]}`;
    const ageFixed = ageFullYearsAtReference(candidate, ref);
    if (ageFixed == null || ageFixed < 14 || ageFixed > 100) return s;
    if (ageFixed >= ageWrong) return s;
    console.warn('[ConstructorAI] birth_date: исправлен типичный век (18xx→19xx)', JSON.stringify({ from: ymd, to: candidate, age_before: ageWrong, age_after: ageFixed }));
    return candidate;
}

/** Доход/суммы из экстрактора: LLM часто шлёт строки "150 000" или дублирует поля — иначе minimal validation падает без причины. */
function parseMoneyishNumber(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v)
        .replace(/\s/g, '')
        .replace(/\u00a0/g, '')
        .replace(/,/g, '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

function coerceClientMoneyAndIncomeInExtraction(extracted) {
    const c = extracted?.client;
    if (!c || typeof c !== 'object') return;
    let inc = parseMoneyishNumber(c.avg_monthly_income);
    if (!Number.isFinite(inc) || inc <= 0) {
        inc = parseMoneyishNumber(c.monthly_income);
    }
    if (!Number.isFinite(inc) || inc <= 0) {
        inc = parseMoneyishNumber(c.salary);
    }
    if (!Number.isFinite(inc) || inc <= 0) {
        inc = parseMoneyishNumber(c.income);
    }
    if (Number.isFinite(inc) && inc > 0) {
        c.avg_monthly_income = inc;
    }

    let cap = parseMoneyishNumber(c.total_liquid_capital);
    if (!Number.isFinite(cap) || cap < 0) {
        cap = parseMoneyishNumber(c.current_value);
    }
    if (!Number.isFinite(cap) || cap < 0) {
        cap = parseMoneyishNumber(c.savings);
    }
    if (Number.isFinite(cap) && cap >= 0) {
        c.total_liquid_capital = cap;
    }
}

/**
 * После JSON.parse экстракции: client.sex из gender, total_liquid_capital из current_value, goals — массив.
 */
function normalizeExtractedFinancialPlanPayload(extracted) {
    if (!extracted || typeof extracted !== 'object') {
        return { client: {}, goals: [] };
    }
    if (!Array.isArray(extracted.goals)) {
        extracted.goals = [];
    }
    if (!extracted.client || typeof extracted.client !== 'object') {
        extracted.client = {};
    }
    const c = extracted.client;
    const canonical = inferCanonicalSex(c.sex) || inferCanonicalSex(c.gender);
    if (canonical) {
        c.sex = canonical;
    }
    const tl = Number(c.total_liquid_capital);
    const hasTl = Number.isFinite(tl) && tl >= 0;
    const cvClient = Number(c.current_value);
    if (!hasTl && Number.isFinite(cvClient) && cvClient >= 0) {
        c.total_liquid_capital = cvClient;
    }
    const rootCv = Number(extracted.current_value);
    const tlNow = Number(c.total_liquid_capital);
    if (!Number.isFinite(tlNow) && Number.isFinite(rootCv) && rootCv >= 0) {
        c.total_liquid_capital = rootCv;
    }
    coerceClientMoneyAndIncomeInExtraction(extracted);
    if (trimText(c.birth_date)) {
        c.birth_date = fixLikelyMissingCenturyInBirthDate(c.birth_date);
    }
    return extracted;
}

function parseFinancialPlanJsonFromLlmText(text) {
    const cleanResult = String(text || '')
        .replace(/```json|```/g, '')
        .trim();
    try {
        return JSON.parse(cleanResult);
    } catch (e1) {
        const i = cleanResult.indexOf('{');
        const j = cleanResult.lastIndexOf('}');
        if (i >= 0 && j > i) {
            try {
                return JSON.parse(cleanResult.slice(i, j + 1));
            } catch (e2) {
                /* fallthrough */
            }
        }
        throw e1;
    }
}

/**
 * Не вызывать calculateFirstRun с заведомо пустой/битой экстракцией (меньше шума в логах и калькуляторе).
 */
function firstRunExtractionMinimallyValidForCalc(extraction) {
    const goals = extraction?.goals;
    if (!Array.isArray(goals) || goals.length === 0) return false;
    const c = extraction?.client && typeof extraction.client === 'object' ? extraction.client : {};
    if (!trimText(c.birth_date)) return false;
    if (!inferCanonicalSex(c.sex) && !inferCanonicalSex(c.gender)) return false;
    const income = Number(c.avg_monthly_income);
    if (!Number.isFinite(income) || income <= 0) return false;
    return true;
}

/** Цель «Квартира» в экстракции: OTHER (4), ровно name «Квартира». */
function isB2cApartmentExtractionGoal(g) {
    if (!g || Number(g.goal_type_id) !== 4) return false;
    return trimText(g.name).toLowerCase() === 'квартира';
}

/**
 * Если в диалоге явно квартира — нормализуем в goal_type_id 4 и name «Квартира».
 */
function normalizeB2cApartmentGoalsInExtraction(extracted) {
    if (!Array.isArray(extracted?.goals)) return;
    extracted.goals = extracted.goals.map((g) => {
        const n = trimText(g?.name);
        if (n && /квартир/i.test(n)) {
            return { ...g, goal_type_id: 4, name: 'Квартира' };
        }
        return g;
    });
}

function hasApartmentOtherGoalInFullCalc(fullGoals) {
    return (fullGoals || []).some((g) => {
        if (Number(g?.goal_type_id) !== 4) return false;
        const n = trimText(g?.goal_name || g?.name || '').toLowerCase();
        return n === 'квартира';
    });
}

/** После LLM-экстракции: для goal_type_id 3 и для «Квартира» (4) выставить term_months из client.birth_date и client.sex. */
function applyB2cPolicyHorizonTermMonthsToExtractedGoals(extracted) {
    const c = extracted?.client;
    if (!c || typeof c !== 'object' || !Array.isArray(extracted.goals)) return;
    const needs = extracted.goals.some(
        (g) => Number(g.goal_type_id) === 3 || isB2cApartmentExtractionGoal(g)
    );
    if (!needs) return;
    const age = ageFullYearsAtReference(c.birth_date);
    const sexForHorizon = inferCanonicalSex(c.sex) || inferCanonicalSex(c.gender);
    const years = computePdsInvestmentHorizonYears(sexForHorizon, age);
    if (years == null) return;
    const termMonths = Math.round(years * 12);
    extracted.goals = extracted.goals.map((g) => {
        if (Number(g.goal_type_id) === 3 || isB2cApartmentExtractionGoal(g)) {
            return { ...g, term_months: termMonths };
        }
        return g;
    });
}

/**
 * Пул first-run — как у пенсии (goal_type_id 1): shared pool из client.total_liquid_capital,
 * списание по цели через resolveInitialCapital(goal.initial_capital) в калькуляторах.
 * Для B2C (ПДС, Квартира) только согласуем goal.initial_capital ↔ total_liquid_capital.
 * Не кладём synthetic client.assets: в _prepareContext пул уже = total_liquid_capital, CASH на мес. 0 из assets не дублируют пул.
 */
function ensureB2cPoolSyncForConstructor(extracted) {
    const client = extracted?.client;
    const goals = extracted?.goals;
    if (!client || typeof client !== 'object' || !Array.isArray(goals)) return;

    const elig = goals.filter((g) => Number(g.goal_type_id) === 3 || isB2cApartmentExtractionGoal(g));
    if (elig.length === 0) return;

    let sumIc = 0;
    for (const g of elig) {
        const ic = Number(g.initial_capital);
        if (Number.isFinite(ic) && ic > 0) sumIc += ic;
    }
    const tl = Number(client.total_liquid_capital);
    const hasTl = Number.isFinite(tl) && tl > 0;

    if (elig.length === 1) {
        const g0 = elig[0];
        const ic0 = Number(g0.initial_capital);
        if (Number.isFinite(ic0) && ic0 > 0) {
            if (!hasTl) client.total_liquid_capital = ic0;
        } else if (hasTl) {
            g0.initial_capital = tl;
        }
    } else if (sumIc > 0 && !hasTl) {
        client.total_liquid_capital = sumIc;
    }
}

/**
 * Экстрактор часто заполняет только client.* и оставляет goals: []. Тогда calculateFirstRun отрабатывает без целей,
 * summary пустой, а генератор «рассказывает» план по истории чата без JSON расчёта — пользователь видит «подождите».
 * Если LLM уже вернул хотя бы одну цель (например только «Квартира»), синтетическую пенсию не добавляем.
 */
function ensureFirstRunExtractionHasPensionGoal(extraction) {
    if (!extraction || typeof extraction !== 'object') return;
    if (!Array.isArray(extraction.goals)) extraction.goals = [];
    if (extraction.goals.length > 0) return;

    const c = extraction.client && typeof extraction.client === 'object' ? extraction.client : {};
    const income = Number(c.avg_monthly_income);
    const capital = Number(c.total_liquid_capital);
    const safeIncome = Number.isFinite(income) && income > 0 ? income : 100000;
    const safeCapital = Number.isFinite(capital) && capital >= 0 ? capital : 0;
    const target = Math.max(1, Math.round(safeIncome * 0.7));

    extraction.goals.push({
        goal_type_id: 1,
        name: 'Пенсия',
        target_amount: target,
        desired_monthly_income: target,
        initial_capital: safeCapital,
        monthly_replenishment: 0,
        risk_profile: 'BALANCED',
    });
    console.warn(
        '[ConstructorAI] firstRun: goals пустой — добавлена синтетическая цель «Пенсия» (goal_type_id=1) для расчёта',
        JSON.stringify({ target_amount: target, initial_capital: safeCapital, avg_monthly_income: safeIncome })
    );
}

/**
 * Клиент для calculateFirstRun: только поля расчёта/карточки + имя из экстракции или nickname (не длинный числовой user_id).
 */
function buildFirstRunCalcClient(constructorClientRow, extraction, projectId) {
    const raw =
        extraction?.client && typeof extraction.client === 'object' ? { ...extraction.client } : {};
    const nick = String(constructorClientRow?.nickname || '').trim();
    const digitsOnly = /^\d+$/.test(nick);
    const longNumericId = digitsOnly && nick.length >= 8;

    if (!trimText(raw.first_name) && !trimText(raw.fio) && nick && !longNumericId) {
        raw.first_name = nick.replace(/^@/, '').slice(0, 120);
    }
    for (const key of ['first_name', 'last_name', 'fio', 'middle_name']) {
        if (raw[key] != null && typeof raw[key] === 'string' && !trimText(raw[key])) {
            delete raw[key];
        }
    }

    return {
        ...raw,
        project_id: projectId,
    };
}

/**
 * Профиль для озвучивания в чате: имя из экстракции или nickname + пол/возраст/доход из экстракции диалога под расчёт.
 * В сыром JSON расчёта полей клиента нет — они появляются только здесь.
 */
function buildClientProfileForAi(constructorClient, extractionClient) {
    const ec = extractionClient && typeof extractionClient === 'object' ? extractionClient : {};
    const nick = trimText(constructorClient?.nickname);
    const fn = trimText(ec.first_name);
    const displayName = fn || nick || null;
    const birth = trimText(ec.birth_date) || null;
    return {
        display_name: displayName,
        first_name: fn || null,
        last_name: trimText(ec.last_name) || null,
        fio: trimText(ec.fio) || null,
        sex: inferCanonicalSex(ec.sex) || inferCanonicalSex(ec.gender) || ec.sex || ec.gender || null,
        birth_date: birth,
        age_years_estimated: birth ? estimateAgeYearsFromBirthDate(birth) : null,
        avg_monthly_income: ec.avg_monthly_income != null ? Number(ec.avg_monthly_income) : null,
        total_liquid_capital: ec.total_liquid_capital != null ? Number(ec.total_liquid_capital) : null,
        note: 'Имя — из извлечения диалога (first_name/fio) или nickname конструктора; пол, дата рождения, доход и капитал — из извлечения для расчёта.',
    };
}

function goalIsPension(g) {
    if (!g || typeof g !== 'object') return false;
    if (Number(g.goal_type_id) === 1) return true;
    return String(g.goal_type || '').toUpperCase() === 'PENSION';
}

function hasPensionGoalInFullCalc(fullGoals) {
    return (fullGoals || []).some(goalIsPension);
}

function collectPresentGoalTypeIds(fullGoals) {
    const s = new Set();
    for (const g of fullGoals || []) {
        const id = Number(g.goal_type_id);
        if (!Number.isNaN(id)) s.add(id);
    }
    return s;
}

function appendFirstRunGoalTypeGlossaries(payload, fullGoals) {
    const ids = collectPresentGoalTypeIds(fullGoals);
    if (ids.has(2)) {
        payload.passive_income_field_glossary_ru = PASSIVE_INCOME_FIELD_GLOSSARY_RU;
        payload.passive_income_narrative_hints_ru = PASSIVE_INCOME_NARRATIVE_HINTS_RU;
    }
    if (ids.has(3)) {
        payload.investment_field_glossary_ru = INVESTMENT_FIELD_GLOSSARY_RU;
        payload.investment_narrative_hints_ru = INVESTMENT_NARRATIVE_HINTS_RU;
    }
    if ([4, 6, 9].some((x) => ids.has(x))) {
        payload.other_goal_field_glossary_ru = OTHER_GOAL_FIELD_GLOSSARY_RU;
        payload.other_goal_narrative_hints_ru = OTHER_GOAL_NARRATIVE_HINTS_RU;
    }
    if (ids.has(5)) {
        payload.life_insurance_field_glossary_ru = LIFE_INSURANCE_FIELD_GLOSSARY_RU;
        payload.life_insurance_details_glossary_ru = LIFE_INSURANCE_DETAILS_GLOSSARY_RU;
        payload.life_insurance_narrative_hints_ru = LIFE_INSURANCE_NARRATIVE_HINTS_RU;
    }
    if (ids.has(7)) {
        payload.fin_reserve_field_glossary_ru = FIN_RESERVE_FIELD_GLOSSARY_RU;
        payload.fin_reserve_narrative_hints_ru = FIN_RESERVE_NARRATIVE_HINTS_RU;
    }
    if (ids.has(8)) {
        payload.rent_field_glossary_ru = RENT_FIELD_GLOSSARY_RU;
        payload.rent_narrative_hints_ru = RENT_NARRATIVE_HINTS_RU;
    }
}

/** Убираем служебный _debug из summary, чтобы не засорять промпт. */
function stripSummaryDebugForAi(goals) {
    return (goals || []).map((g) => {
        if (!g || !g.summary || g.summary._debug === undefined) return g;
        const { _debug, ...restSummary } = g.summary;
        return { ...g, summary: restSummary };
    });
}

/** goal_type, пенсия, портфель, НСЖ, аренда — срезы из полного расчёта для ИИ. */
function enrichCompactGoalsForAiPresentation(compactGoals, fullGoals) {
    const byId = new Map();
    for (const g of fullGoals || []) {
        const id = g.goal_id ?? g.id;
        if (id != null) byId.set(String(id), g);
    }
    return (compactGoals || []).map((cg) => {
        const full = cg.goal_id != null ? byId.get(String(cg.goal_id)) : null;
        const isPension = goalIsPension(cg) || goalIsPension(full);
        const typeId = Number(full?.goal_type_id ?? cg.goal_type_id);
        const d = full?.details;

        const out = {
            ...cg,
            goal_type: full?.goal_type || cg.goal_type || (isPension ? 'PENSION' : undefined),
        };

        if (d && (d.portfolio_id != null || d.portfolio_name)) {
            out.portfolio_snapshot_for_ai = {
                portfolio_id: d.portfolio_id ?? null,
                portfolio_name: d.portfolio_name ?? null,
            };
        }

        if (isPension && d?.state_pension) {
            const sp = d.state_pension;
            out.retirement_timeline = {
                retirement_year: sp.retirement_year,
                years_to_pension: sp.years_to_pension,
                retirement_age: sp.retirement_age,
            };
            out.state_pension_details_for_ai = {
                ipk_total: sp.ipk_total,
                ipk_current: sp.ipk_current,
                ipk_forecast: sp.ipk_forecast,
                point_cost_today: sp.point_cost_today,
                point_cost_future: sp.point_cost_future,
                fixed_payment_today: sp.fixed_payment_today,
                fixed_payment_future: sp.fixed_payment_future,
            };
        }

        if (typeId === 5 && d) {
            out.life_details_for_ai = {
                program_name: d.program_name,
                annual_premium: d.annual_premium,
                tax_deduction_2026: d.tax_deduction_2026,
                total_tax_deductions: d.total_tax_deductions,
                risks_for_ai: Array.isArray(d.risks)
                    ? d.risks.slice(0, 12).map((r) => ({
                          risk_name: r.risk_name,
                          limit_amount: r.limit_amount,
                      }))
                    : [],
            };
        }

        if (typeId === 8 && Array.isArray(d?.instruments) && d.instruments.length > 0) {
            out.rent_instruments_short_for_ai = d.instruments.slice(0, 8).map((x) => ({
                name: x.name || x.title || x.product_name,
                share: x.share_percent != null ? x.share_percent : x.share,
            }));
        }

        return out;
    });
}

/**
 * Расширенный объект для второго user-сообщения после firstRun: компакт расчёта + профиль клиента для ИИ + глоссарий по пенсии.
 */
function buildFirstRunAiTrailingPayload(calculationResult, { constructorClient, extraction } = {}) {
    const compact = compactCalculationForPresentationPrompt(calculationResult);
    const full = calculationPayloadForGeneratorPrompt(calculationResult);
    const fullGoals = Array.isArray(full?.goals) ? full.goals : [];

    const payload = {
        ...compact,
        goals: stripSummaryDebugForAi(enrichCompactGoalsForAiPresentation(compact.goals, fullGoals)),
    };

    payload.client_for_ai = buildClientProfileForAi(constructorClient, extraction?.client);
    payload.goal_type_id_labels_ru = GOAL_TYPE_ID_LABELS_RU;

    payload.goal_summary_tax_glossary_ru = GOAL_SUMMARY_TAX_GLOSSARY_RU;
    payload.plan_tax_and_state_benefits_glossary_ru = PLAN_TAX_AND_STATE_BENEFITS_GLOSSARY_RU;
    payload.plan_tax_narrative_hints_ru = PLAN_TAX_NARRATIVE_HINTS_RU;

    appendFirstRunGoalTypeGlossaries(payload, fullGoals);

    if (hasPensionGoalInFullCalc(fullGoals)) {
        payload.pension_field_glossary_ru = PENSION_PRESENTATION_FIELD_HELP_RU;
        payload.pension_state_pension_glossary_ru = PENSION_STATE_PENSION_MODEL_GLOSSARY_RU;
        payload.pension_presentation_structure_ru = [
            'Заголовок раздела: «Основная цель: Достойная пенсия» (человечнее, чем сухое «Пенсия»). При необходимости в скобках — кратко goal_name из JSON.',
            'СТРОГИЙ ПОРЯДОК СНАЧАЛА ПРО ДОХОДЫ, ПОТОМ ПРО КАПИТАЛ — не бросай цифру капитала до объяснения разрыва.',
            'Термины для п.1–3: везде явно используй формулировку **в сегодняшних ценах** (можно добавить: «покупательная способность как сегодня»). ЗАПРЕЩЕНО писать «без учёта инфляции» про желаемый доход — звучит как ошибка; «в сегодняшних ценах» как раз и значит сопоставимо с сегодняшним рублём.',
            '1) Желаемый доход в месяц **в сегодняшних ценах**: target_amount_initial и/или projected_pension_monthly_present.',
            '2) Ожидаемая государственная пенсия в месяц **в сегодняшних ценах**: state_pension_monthly_today (детали модели — в PDF).',
            '3) Необходимый дополнительный доход в месяц **в сегодняшних ценах**: разница желаемого и госпенсии (если оба поля есть): target_amount_initial − state_pension_monthly_today.',
            '4) Контраст с п.1–3: к году выхода на пенсию тот же разрыв в **ценах будущего года (номинал к пенсии)** — примерно pension_gap_future ₽/мес; кратко: в расчёт заложена инфляция (inflation_rate). Это не «ещё один доход», а тот же доп. доход, но выраженный в рублях «уже на пенсии».',
            '5) Только после п.1–4 — капитал: «Чтобы обеспечить такой дополнительный доход за счёт накоплений, к выходу на пенсию в модели формируется капитал порядка projected_capital_at_retirement ₽. С этой суммы в сценарии идёт выплата за счёт доходности на этапе выплат (payout_yield_percent) — по сути «доп. пенсия» с капитала. Накопления остаются вашими: при желании можно использовать и тело капитала, не только проценты» — формулируй своими словами, без канцелярита.',
            '6) Дальше: стартовый взнос initial_capital (и при необходимости initial_capital_ops), рекомендуемое ежемесячное пополнение monthly_replenishment; год выхода retirement_timeline.retirement_year.',
            '7) Налоги — по plan_tax_narrative_hints_ru; PDF — одна строка в конце при необходимости.',
            'Не называй крупную сумму капитала до того, как пользователь понял разрыв доходов **в сегодняшних ценах** и **в номинале к пенсии**.',
        ];
        payload.pension_narrative_hints_ru = [
            'Следуй pension_presentation_structure_ru; для доходов п.1–3 только «в сегодняшних ценах», не «без учёта инфляции».',
            'Обращение: по client_for_ai.display_name (если null — «вы»). Лицо рассказа нейтральное или по стилю бота («в расчёт заложена инфляция»), не навязывай женский/мужской род без заданного стиля.',
            'Поля: pension_field_glossary_ru, state_pension_details_for_ai, pension_state_pension_glossary_ru; капитал = projected_capital_at_retirement; не путать target_amount_future с капиталом.',
            'При status=GAP — мягко про нагрузку на бюджет.',
        ];
    }

    if (hasApartmentOtherGoalInFullCalc(fullGoals)) {
        payload.other_goal_apartment_presentation_structure_ru = OTHER_GOAL_APARTMENT_PRESENTATION_STRUCTURE_RU;
        payload.other_goal_apartment_narrative_hints_ru = OTHER_GOAL_APARTMENT_NARRATIVE_HINTS_RU;
    }

    return payload;
}

function buildCalcAiTrailingPayload(calculationResult) {
    const compact = compactCalculationForPresentationPrompt(calculationResult);
    return {
        ...compact,
        goals: stripSummaryDebugForAi(compact.goals),
        mode: 'recalculate',
        hints_ru: [
            'Это результат пересчёта существующего плана.',
            'Показывай только цифры из JSON, без фраз «сейчас посчитаю».',
            'Сконцентрируйся на изменившейся цели и её влиянии на план.',
        ],
    };
}

/**
 * Генератор: system + опционально хвост из user-сообщений.
 * Для firstRun с готовым расчётом JSON кладём во второе user-сообщение после реплики пользователя —
 * иначе модель часто игнорирует хвост огромного system и продолжает сценарий «сейчас посчитаю».
 */
function buildConstructorGeneratorPromptParts(bot, brainSection, command, calculationResult, client, generatorExtras = {}) {
    const sections = [];

    const cmdKeyNorm = trimText(command?.command || '').toLowerCase();
    const hasCalcPayload =
        calculationResult != null &&
        typeof calculationResult === 'object' &&
        Object.keys(calculationResult).length > 0;
    const calcOk = firstRunCalculationSucceeded(calculationResult);
    const firstRunWithCalc = isFirstRunCalculationCommand(cmdKeyNorm) && calcOk;
    const firstRunStageNoCalc = isFirstRunCalculationCommand(cmdKeyNorm) && !calcOk;
    const calcRecalculateWithResult = isCalcRecalculateCommand(cmdKeyNorm) && hasCalcPayload;

    if (firstRunWithCalc) {
        sections.push(
            'КРИТИЧЕСКИ ВАЖНО ДЛЯ ЭТОГО ОТВЕТА:\n' +
                'Финансовый план УЖЕ рассчитан на сервере. Сразу после истории диалога тебе будет отдельное пользовательское сообщение с JSON результата.\n' +
                'Твоя задача — кратко презентовать пользователю итоги из этого JSON (ключевые суммы, сроки, выводы).\n' +
                'НАЛОГИ И ЛЬГОТЫ — В ЭТОМ ЖЕ ОТВЕТЕ СРАЗУ: summary.tax_benefits_summary, summary.total_state_benefit; по целям — total_tax_benefit и total_cofinancing при необходимости. Не заканчивай вопросом «рассказать про налоги?». Все суммы по вычетам и льготам формулируй как оценку по модели расчёта, не как гарантию от государства и не как налоговую консультацию.\n' +
                'НЕ ДУБЛИРУЙ: при одной цели в плане (goals_count === 1) или когда цифры по цели совпадают с итогом плана — не перечисляй одинаковые суммы и «по плану», и «по цели» отдельными списками; один компактный блок или одна фраза-связка.\n' +
                'Стиль: опирайся на «Стиль общения» бота; избегай тяжёлого канцелярита в финале. В самом конце — одна короткая строка про PDF-отчёт, если пользователю нужны таблицы и детализация (без навязчивости).\n' +
                'В JSON для firstRun: client_for_ai; расшифровки — plan_tax_and_state_benefits_glossary_ru, goal_summary_tax_glossary_ru, plan_tax_narrative_hints_ru; для пенсии — pension_presentation_structure_ru (желаемый доход, госпенсия и доп. разрыв формулируй **в сегодняшних ценах**; не используй «без учёта инфляции»), pension_*; для цели «Квартира» (OTHER, goal_name «Квартира») — other_goal_apartment_presentation_structure_ru и other_goal_apartment_narrative_hints_ru; для остальных — passive_income_*, investment_*, other_goal_*, life_insurance_*, fin_reserve_*, rent_*. На пенсии не путай initial_capital со target_amount_initial; капитал — projected_capital_at_retirement; target_amount_future — желаемый доход в месяц в номинале к пенсии, не капитал.\n' +
                'ЗАПРЕЩЕНО: «я сейчас рассчитаю», «буквально через мгновение», «подождите», «начинаю расчёт», «сейчас посчитаю» — расчёт уже завершён.\n' +
                'Не заканчивай ответ только пересказом введённых полей; опирайся на JSON из следующего сообщения.'
        );
    }

    if (firstRunStageNoCalc) {
        sections.push(
            'КРИТИЧЕСКИ ВАЖНО: серверный расчёт НЕ выполнен. ЗАПРЕЩЕНО придумывать суммы, проценты, взносы, сроки и «примерный план».\n' +
                'Не обещай расчёт «сейчас» или «через минуту». Два коротких предложения: извинение + попроси пользователя повторить цифры (доход, возраст/дата рождения, пол, капитал, цель).'
        );
    }

    if (calcRecalculateWithResult) {
        sections.push(
            'КРИТИЧЕСКИ ВАЖНО ДЛЯ /calc:\n' +
                'Пересчёт уже выполнен на сервере, ниже в сообщениях есть JSON результата.\n' +
                'Опиши изменения по цели и краткий вывод без повторного запроса данных.\n' +
                'ЗАПРЕЩЕНО писать, что расчёт только начинается.'
        );
    }

    const base = trimText(bot?.base_brain_context);
    const bs = trimText(brainSection);
    const mergedMainContext = [base, bs].filter(Boolean).join('\n\n');
    sections.push(
        `Главный контекст:\n${
            mergedMainContext ||
            'Контекст не настроен в БД. Следуй сценарию стадии и отвечай нейтрально, без выдумывания фактов.'
        }`
    );

    const style = trimText(bot?.communication_style);
    if (style) sections.push(`Стиль общения:\n${style}`);

    const resp = command?.response != null ? String(command.response) : '';
    const cmdKey = trimText(command?.command);
    if (trimText(resp)) {
        sections.push(cmdKey ? `Сценарий (${cmdKey}):\n${trimText(resp)}` : `Сценарий:\n${trimText(resp)}`);
    }

    // JSON в system — только не firstRun (например /homeownerscalc). Для firstRun успешный JSON только в user-хвосте.
    if (hasCalcPayload && !isFirstRunCalculationCommand(cmdKeyNorm)) {
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
        const aiPayload = buildFirstRunAiTrailingPayload(calculationResult, {
            constructorClient: client,
            extraction: generatorExtras.firstRunExtraction,
        });
        trailingUserCalculationJson = JSON.stringify(aiPayload, null, 2);
    } else if (calcRecalculateWithResult) {
        trailingUserCalculationJson = JSON.stringify(buildCalcAiTrailingPayload(calculationResult), null, 2);
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

function normalizeConstructorCommandKey(cmd) {
    return String(cmd || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}

/**
 * Тексты всех реплик пользователя из истории для роутера + текущее сообщение.
 * Имя без возраста/пола не считаем достаточным для /vozrast — см. shouldStayOnStartpfpInsteadOfVozrast.
 */
function concatUserTextsForClassifierGate(historyMessages, userMessage) {
    const fromHistory = (Array.isArray(historyMessages) ? historyMessages : [])
        .filter((m) => m && m.role === 'user')
        .map((m) => trimText(m.content))
        .filter(Boolean);
    const last = trimText(userMessage);
    const parts = last ? [...fromHistory, last] : fromHistory;
    return parts.join('\n');
}

/** Явно указанный возраст (число лет), без догадок по имени. */
function userDialogueHasExplicitAge(text) {
    const t = (text || '').toLowerCase();
    if (!t) return false;
    if (/\bмне\s+(\d{1,2})\b/.test(t)) {
        const m = t.match(/\bмне\s+(\d{1,2})\b/);
        const n = parseInt(m[1], 10);
        if (n >= 14 && n <= 99) return true;
    }
    if (/\bвозраст\s*[:\-–]?\s*(\d{1,2})\b/.test(t)) {
        const m = t.match(/\bвозраст\s*[:\-–]?\s*(\d{1,2})\b/);
        const n = parseInt(m[1], 10);
        if (n >= 14 && n <= 99) return true;
    }
    if (/\b(\d{1,2})\s*(лет|года|год)\b/.test(t)) return true;
    return false;
}

/** Явный пол; только имя (например «Юля») или угадывание по имени — НЕ достаточно. */
function userDialogueHasExplicitGender(text) {
    const raw = text || '';
    const t = raw.toLowerCase();
    if (/[👩👨⚧️]/.test(raw)) return true;
    if (/\b(мужчина|женщина|мужской|женский|девушка|парень)\b/.test(t)) return true;
    if (/\bпол\s*[:\-–]?\s*(м|ж|муж|жен|муж\.|жен\.)\b/.test(t)) return true;
    if (/\bя\s+мужчина\b/.test(t) || /\bя\s+женщина\b/.test(t)) return true;
    return false;
}

/**
 * Роутер часто выбирает /vozrast, «выводя» пол из имени. Держим /startpfp, пока в репликах пользователя
 * нет и явного возраста, и явного пола.
 */
function shouldStayOnStartpfpInsteadOfVozrast(currentCommandKey, nextCommandKey, historyMessages, userMessage) {
    if (normalizeConstructorCommandKey(currentCommandKey) !== '/startpfp') return false;
    if (normalizeConstructorCommandKey(nextCommandKey) !== '/vozrast') return false;
    const blob = concatUserTextsForClassifierGate(historyMessages, userMessage);
    const ok = userDialogueHasExplicitAge(blob) && userDialogueHasExplicitGender(blob);
    return !ok;
}

function pickFirstNonEmpty(...values) {
    for (const v of values) {
        if (v == null) continue;
        const t = String(v).trim();
        if (t) return t;
    }
    return '';
}

function normalizeRecalculatePatch(extracted) {
    const payload = extracted && typeof extracted === 'object' ? extracted : {};
    const targetGoal = payload.target_goal && typeof payload.target_goal === 'object' ? payload.target_goal : {};
    const goalPatch = payload.goal_patch && typeof payload.goal_patch === 'object' ? payload.goal_patch : {};
    const clientPatch = payload.client_patch && typeof payload.client_patch === 'object' ? payload.client_patch : {};
    const needsClarification = Boolean(payload.needs_clarification);
    const clarificationQuestion = trimText(payload.clarification_question);

    const numericGoalFields = [
        'goal_type_id',
        'target_amount',
        'term_months',
        'monthly_replenishment',
        'initial_capital',
        'desired_monthly_income',
        'inflation_rate',
        'priority',
        'id',
        'goal_id',
        'ipk_current',
        'ipk_forecast',
        'ipk_total',
        'ops_capital',
    ];
    for (const key of numericGoalFields) {
        if (goalPatch[key] !== undefined && goalPatch[key] !== null && goalPatch[key] !== '') {
            const n = Number(goalPatch[key]);
            if (Number.isFinite(n)) goalPatch[key] = n;
        }
    }

    for (const key of ['id', 'goal_type_id']) {
        if (targetGoal[key] !== undefined && targetGoal[key] !== null && targetGoal[key] !== '') {
            const n = Number(targetGoal[key]);
            if (Number.isFinite(n)) targetGoal[key] = n;
        }
    }
    targetGoal.name = trimText(targetGoal.name);

    for (const key of ['avg_monthly_income', 'total_liquid_capital', 'ipk_current', 'ops_capital']) {
        if (clientPatch[key] !== undefined && clientPatch[key] !== null && clientPatch[key] !== '') {
            const n = Number(clientPatch[key]);
            if (Number.isFinite(n)) clientPatch[key] = n;
        }
    }

    return {
        target_goal: targetGoal,
        goal_patch: goalPatch,
        client_patch: clientPatch,
        needs_clarification: needsClarification,
        clarification_question: clarificationQuestion,
    };
}

function normalizeDbGoalForRecalculate(goal) {
    let parsed = { ...(goal || {}) };
    let fromParams = {};
    if (typeof parsed.params === 'string') {
        try {
            fromParams = JSON.parse(parsed.params);
        } catch (_) {
            fromParams = {};
        }
    } else if (parsed.params && typeof parsed.params === 'object') {
        fromParams = parsed.params;
    }
    parsed = { ...fromParams, ...parsed };
    const numericFields = [
        'goal_type_id',
        'target_amount',
        'term_months',
        'monthly_replenishment',
        'initial_capital',
        'desired_monthly_income',
        'inflation_rate',
        'priority',
        'id',
        'goal_id',
        'ipk_current',
        'ipk_forecast',
        'ipk_total',
        'ops_capital',
    ];
    for (const field of numericFields) {
        if (parsed[field] !== undefined && parsed[field] !== null && parsed[field] !== '') {
            const n = Number(parsed[field]);
            if (Number.isFinite(n)) parsed[field] = n;
        }
    }
    return parsed;
}

class ConstructorAiService {
    _extractDocSearchTerms(text) {
        return Array.from(
            new Set(
                String(text || '')
                    .toLowerCase()
                    .replace(/[^a-zа-яё0-9\s-]/gi, ' ')
                    .split(/\s+/)
                    .filter((w) => w.length >= 4)
            )
        ).slice(0, 12);
    }

    _buildDocTermVariants(term) {
        const t = String(term || '').toLowerCase().trim();
        if (!t) return [];
        const variants = new Set([t]);
        if (t.length >= 6) variants.add(t.slice(0, t.length - 1));
        if (t.length >= 7) variants.add(t.slice(0, t.length - 2));
        if (t.length >= 5) variants.add(t.slice(0, 4));
        return Array.from(variants).filter((v) => v.length >= 3);
    }

    _selectRelevantDocSnippet(text, searchTerms) {
        const raw = String(text || '');
        if (!raw) return '';
        const CHUNK_SIZE = 1200;
        const CHUNK_OVERLAP = 200;
        const MAX_SNIPPET = 2800;

        const boostedTerms = Array.from(
            new Set(searchTerms.flatMap((t) => this._buildDocTermVariants(t)).concat(['офис', 'адрес', 'тел', 'телефон', 'набереж', 'челн']))
        );

        const chunks = [];
        for (let i = 0; i < raw.length; i += (CHUNK_SIZE - CHUNK_OVERLAP)) {
            const piece = raw.slice(i, i + CHUNK_SIZE);
            if (!piece) continue;
            const low = piece.toLowerCase();
            let score = 0;
            for (const term of boostedTerms) {
                if (!term) continue;
                let pos = 0;
                while (true) {
                    const idx = low.indexOf(term, pos);
                    if (idx === -1) break;
                    score += 1;
                    pos = idx + term.length;
                }
            }
            if (/ул\.|улица|д\.|дом|тел|телефон/i.test(piece)) score += 2;
            chunks.push({ piece, score, idx: i });
        }

        chunks.sort((a, b) => b.score - a.score || a.idx - b.idx);
        const top = chunks.filter((c) => c.score > 0).slice(0, 3);
        const merged = top.length ? top.map((c) => c.piece.trim()).join('\n\n...\n\n') : raw.slice(0, MAX_SNIPPET);
        return merged.slice(0, MAX_SNIPPET);
    }

    async _buildDynamicConstructorBrainSection(projectId, userMessage, historyMessages, baseBrainSection) {
        if (!isConstructorDocContextEnabled()) {
            return baseBrainSection;
        }
        if (!projectId) return baseBrainSection;

        const docRows = await knex('ai_b2c_chat_brain_context_documents as d')
            .join('ai_b2c_chat_brain_contexts as c', 'd.brain_context_id', 'c.id')
            .where('d.is_active', true)
            .where('c.is_active', true)
            .andWhere('d.project_id', projectId)
            .andWhere('c.project_id', projectId)
            .select('d.id', 'd.original_filename', 'd.extracted_text');

        if (!docRows.length) {
            if (isConstructorDocDebugOn()) {
                console.log('[ConstructorAI DOC DEBUG] No active documents found for project', projectId);
            }
            return baseBrainSection;
        }

        const searchTerms = this._extractDocSearchTerms(userMessage);
        const selectedDocs = docRows
            .map((row) => ({
                id: row.id,
                filename: row.original_filename,
                snippet: this._selectRelevantDocSnippet(row.extracted_text, searchTerms)
            }))
            .filter((x) => x.snippet && x.snippet.trim().length > 0)
            .slice(0, 5);

        const docSection = selectedDocs
            .map((d) => `--- ДОКУМЕНТ: ${d.filename} ---\n${d.snippet}`)
            .join('\n\n');

        const sourceContext = [baseBrainSection, docSection].filter(Boolean).join('\n\n');
        const historyTail = (historyMessages || [])
            .slice(-6)
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');

        const architectMessages = [
            {
                role: 'system',
                content: [
                    'Ты архитектор контекста для чат-ассистента.',
                    'Выбери из SOURCE_CONTEXT только факты, релевантные вопросу пользователя.',
                    'Верни строго JSON: {"dynamic_context":"...","used_docs":["..."]}',
                    'Не выдумывай факты, используй только SOURCE_CONTEXT.',
                    'Если данных не хватает — напиши это в dynamic_context.'
                ].join('\n')
            },
            {
                role: 'user',
                content: [
                    `QUESTION:\n${userMessage}`,
                    '',
                    `HISTORY:\n${historyTail || 'no history'}`,
                    '',
                    `SOURCE_CONTEXT:\n${sourceContext}`
                ].join('\n')
            }
        ];

        try {
            const raw = await aiService.getCompletion(architectMessages);
            const jsonMatch = String(raw || '').match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            const dynamic = String(parsed?.dynamic_context || '').trim();
            const finalSection = dynamic || sourceContext;
            if (isConstructorDocDebugOn()) {
                console.log(
                    '[ConstructorAI DOC DEBUG] selected docs',
                    JSON.stringify(
                        {
                            projectId,
                            question: String(userMessage || '').slice(0, 180),
                            searchTerms,
                            selectedDocs: selectedDocs.map((d) => ({ id: d.id, filename: d.filename, snippetChars: d.snippet.length })),
                            dynamicContextChars: dynamic.length
                        },
                        null,
                        2
                    )
                );
            }
            return finalSection;
        } catch (e) {
            console.warn('[ConstructorAI DOC DEBUG] dynamic context architect failed:', e.message || e);
            return sourceContext;
        }
    }

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
                let cmdForThisTurn = startCmd;
                // Как в classifyStage: первое сообщение — имя или отказ от имени → сразу /startpfp,
                // иначе на первом ходе залипаем на /start и второй ИИ читает «общий» контекст вместо твоего сценария startpfp.
                if (shouldForceStartpfpFromStart(userMessage)) {
                    const bot = await knex('constructor_bots').where('id', botId).first();
                    if (bot) {
                        const commands = await knex('constructor_commands')
                            .where('bot_id', bot.id)
                            .orWhere(function () {
                                this.where('is_template', true).andWhere('project_id', bot.project_id);
                            })
                            .orderByRaw('bot_id DESC, is_template ASC');
                        const startpfp = findCommandByKey(commands, '/startpfp');
                        if (startpfp) {
                            cmdForThisTurn = startpfp;
                            console.log(
                                '[ConstructorAI Step1] Первый ход: имя/отказ → контекст /startpfp (без классификатора)',
                                JSON.stringify({ sessionId: session.id, command: startpfp.command, id: startpfp.id })
                            );
                            if (traceStream && isConstructorAiTraceOn()) {
                                traceConstructorMeta('stream.first_turn_promote_startpfp', {
                                    reason: 'shouldForceStartpfpFromStart на первом ходе',
                                    userPreview: truncateTraceText(userMessage, 80),
                                    command: { id: startpfp.id, key: startpfp.command },
                                });
                            }
                        }
                    }
                }
                if (cmdForThisTurn === startCmd) {
                    console.log(
                        '[ConstructorAI Step1] Роутер LLM НЕ вызывается (первый ход): пустой лог и нет current_command_id → /start.',
                        JSON.stringify({ sessionId: session.id, command: startCmd.command, commandId: startCmd.id })
                    );
                    if (traceStream && isConstructorAiTraceOn()) {
                        traceConstructorMeta('stream.first_turn_skip_classifier', {
                            reason:
                                'constructor_logs пуст и current_command_id null — контекст ответа из /start, роутер LLM не вызывается',
                            command: { id: startCmd.id, key: startCmd.command },
                        });
                    }
                }
                return {
                    nextCommand: cmdForThisTurn,
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

            let forcedStayStartpfpOverVozrast = false;
            if (
                currentCommand &&
                nextCommand &&
                shouldStayOnStartpfpInsteadOfVozrast(
                    currentCommand.command,
                    nextCommand.command,
                    historyMessages,
                    userMessage
                )
            ) {
                const startpfp = findCommandByKey(commands, '/startpfp');
                if (startpfp) {
                    console.log(
                        '[AI Step 1] Forced stay on /startpfp: /vozrast отклонён — в репликах пользователя нет явного возраста и пола одновременно'
                    );
                    nextCommand = startpfp;
                    forcedStayStartpfpOverVozrast = true;
                }
            }

            traceConstructorMeta('step1_classifier_resolved', {
                nextCommand: nextCommand ? { id: nextCommand.id, command: nextCommand.command } : null,
                forcedStartpfp,
                forcedStayStartpfpOverVozrast,
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
        const sessionClient = await knex('constructor_clients').where('id', session.client_id).first();
        let systemPromptMeta = { content: DEFAULT_FINANCIAL_EXTRACTION_SYSTEM_PROMPT, source: 'default', commandId: null };
        if (sessionClient && sessionClient.bot_id != null) {
            systemPromptMeta = await resolveFinancialExtractionSystemPrompt(sessionClient.bot_id);
        } else {
            console.warn(
                '[AI Extraction] constructor_client missing or no bot_id; using default financial extraction system prompt'
            );
        }
        console.log(
            `[AI Extraction] Financial plan system prompt: ${systemPromptMeta.source}` +
                (systemPromptMeta.commandId != null ? ` (commandId=${systemPromptMeta.commandId})` : '')
        );

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
                content: systemPromptMeta.content,
            },
            {
                role: 'user',
                content: `Диалог:\n${fullContext}`
            }
        ];

        let result;
        try {
            console.log(`[AI Extraction] Extracting Financial Params...`);
            result = await aiService.getCompletion(prompt);
        } catch (error) {
            console.error('[AI] Error extracting financial params (LLM):', error);
            return { client: {}, goals: [] };
        }

        let extracted;
        try {
            extracted = parseFinancialPlanJsonFromLlmText(result);
        } catch (parseErr) {
            console.error('[AI] Error parsing financial extraction JSON:', parseErr.message);
            console.error('[AI] Raw LLM extraction (truncated):', truncateTraceText(result, 800));
            return { client: {}, goals: [] };
        }

        try {
            normalizeExtractedFinancialPlanPayload(extracted);

            if (extracted.client && typeof extracted.client === 'object') {
                const c = extracted.client;
                for (const key of ['first_name', 'last_name', 'fio', 'middle_name']) {
                    if (c[key] != null && typeof c[key] === 'string') {
                        const t = c[key].trim();
                        c[key] = t || null;
                    }
                }
            }

            normalizeB2cApartmentGoalsInExtraction(extracted);
            ensureB2cPoolSyncForConstructor(extracted);

            if (extracted.goals && Array.isArray(extracted.goals)) {
                extracted.goals = extracted.goals.map((g) => ({
                    ...g,
                    risk_profile: 'BALANCED',
                }));
            }

            applyB2cPolicyHorizonTermMonthsToExtractedGoals(extracted);

            console.log(`[AI Extraction] Extracted with Balanced Profile:`, extracted);
            return extracted;
        } catch (normErr) {
            console.error('[AI] Error normalizing financial extraction (возвращаем сырой JSON после парса):', normErr);
            return extracted;
        }
    }

    async extractRecalculatePatch(session, userMessage, planContext = {}) {
        const history = await knex('constructor_logs').where('session_id', session.id).orderBy('created_at', 'desc').limit(12);
        const historyText = history
            .reverse()
            .map((log) => `User: ${log.input_text}\nAssistant: ${log.response_generated}`)
            .join('\n');
        const goalsForPrompt = Array.isArray(planContext.goals)
            ? planContext.goals.map((g) => ({
                  id: g.id,
                  goal_type_id: g.goal_type_id,
                  name: g.name,
                  target_amount: g.target_amount,
                  desired_monthly_income: g.desired_monthly_income,
                  term_months: g.term_months,
                  monthly_replenishment: g.monthly_replenishment,
                  initial_capital: g.initial_capital,
                  risk_profile: g.risk_profile,
                  ipk_current: g.ipk_current,
                  ipk_forecast: g.ipk_forecast,
                  ipk_total: g.ipk_total,
                  ops_capital: g.ops_capital,
              }))
            : [];
        const prompt = [
            { role: 'system', content: DEFAULT_RECALCULATE_EXTRACTION_SYSTEM_PROMPT },
            {
                role: 'user',
                content:
                    `Текущие цели клиента (обязательно используй их id):\n${JSON.stringify(goalsForPrompt, null, 2)}\n\n` +
                    `История:\n${historyText}\nUser: ${userMessage}`,
            },
        ];
        try {
            const raw = await aiService.getCompletion(prompt);
            const parsed = parseFinancialPlanJsonFromLlmText(raw);
            return normalizeRecalculatePatch(parsed);
        } catch (err) {
            console.error('[AI] Error extracting /calc recalculate patch:', err.message || err);
            return {
                target_goal: {},
                goal_patch: {},
                client_patch: {},
                needs_clarification: true,
                clarification_question: 'Уточните, какую цель пересчитать и какие параметры поменялись.',
            };
        }
    }

    async runCalcRecalculateFlow({ session, bot, client, userMessage }) {
        if (!client?.pfp_client_id) {
            return {
                calculationResult: null,
                pdfUrl: null,
                firstRunExtraction: null,
                calcInstructionMessage:
                    'Для пересчёта сначала нужен стартовый план. Давайте сначала сделаем /firstRunAIB2C, потом вернёмся к /calc.',
            };
        }

        const pfpClientId = Number(client.pfp_client_id);
        const existingClient = await clientService.getFullClient(pfpClientId, bot.project_id);
        if (!existingClient || !Array.isArray(existingClient.goals) || existingClient.goals.length === 0) {
            return {
                calculationResult: null,
                pdfUrl: null,
                firstRunExtraction: null,
                calcInstructionMessage: 'Не нашёл сохранённый план для пересчёта. Давайте сначала пересоберём first run.',
            };
        }

        const existingGoals = existingClient.goals.map(normalizeDbGoalForRecalculate);
        const patchPayload = await this.extractRecalculatePatch(session, userMessage, { goals: existingGoals });

        if (patchPayload.needs_clarification) {
            return {
                calculationResult: null,
                pdfUrl: null,
                firstRunExtraction: null,
                calcInstructionMessage:
                    patchPayload.clarification_question ||
                    'Уточните, какую цель пересчитать и что именно меняем (сумма, срок, пополнение и т.д.).',
            };
        }

        const goalsMap = new Map();
        existingGoals.forEach((g) => {
            if (g.id != null) goalsMap.set(String(g.id), g);
        });

        const requestedGoalId = pickFirstNonEmpty(
            patchPayload.target_goal?.id,
            patchPayload.goal_patch?.id,
            patchPayload.goal_patch?.goal_id
        );
        let targetGoalId = requestedGoalId ? String(requestedGoalId) : null;
        if (!targetGoalId) {
            const byTypeAndName = existingGoals.find((g) => {
                const typeOk =
                    patchPayload.target_goal?.goal_type_id == null ||
                    Number(g.goal_type_id) === Number(patchPayload.target_goal.goal_type_id);
                const nameFilter = trimText(patchPayload.target_goal?.name).toLowerCase();
                const nameOk = !nameFilter || trimText(g.name).toLowerCase() === nameFilter;
                return typeOk && nameOk;
            });
            if (byTypeAndName?.id != null) targetGoalId = String(byTypeAndName.id);
        }

        if (!targetGoalId || !goalsMap.has(targetGoalId)) {
            return {
                calculationResult: null,
                pdfUrl: null,
                firstRunExtraction: null,
                calcInstructionMessage:
                    'Не смогла однозначно определить цель для пересчёта. Напишите точнее: какая цель и что меняем.',
            };
        }

        const existingGoal = goalsMap.get(targetGoalId);
        const goalPatch = { ...patchPayload.goal_patch };
        delete goalPatch.id;
        delete goalPatch.goal_id;

        const clientPatch = { ...(patchPayload.client_patch || {}) };
        // У clients нет колонки ops_capital — только у цели; иначе updateClient падает на SQL.
        if (
            clientPatch.ops_capital !== undefined &&
            clientPatch.ops_capital !== null &&
            clientPatch.ops_capital !== '' &&
            (goalPatch.ops_capital === undefined || goalPatch.ops_capital === null || goalPatch.ops_capital === '')
        ) {
            const o = Number(clientPatch.ops_capital);
            if (Number.isFinite(o)) goalPatch.ops_capital = o;
        }
        delete clientPatch.ops_capital;

        const updatedGoal = goalRecalculator.prepare(existingGoal, goalPatch);
        goalsMap.set(targetGoalId, updatedGoal);

        const clientForCalc = {
            ...existingClient,
            ...clientPatch,
            assets: clientPatch.assets || existingClient.assets || [],
            total_liquid_capital:
                clientPatch.total_liquid_capital !== undefined
                    ? clientPatch.total_liquid_capital
                    : existingClient.total_liquid_capital,
            project_id: bot.project_id,
        };
        const calcRequest = { client: clientForCalc, goals: Array.from(goalsMap.values()) };
        const previousCalculation = existingClient.goals_summary || null;
        const calculationResponse = await calculationService.calculateFirstRun(
            calcRequest,
            targetGoalId,
            previousCalculation,
            { isFirstRun: false, usePool: false }
        );
        const calculation = calculationResponse.calculation || calculationResponse;

        await clientService.updateGoal(pfpClientId, targetGoalId, goalsMap.get(targetGoalId));
        if (Object.keys(clientPatch).length > 0) {
            await clientService.updateClient(pfpClientId, clientPatch, bot.project_id);
        }
        await syncCalculationGoalsWithDatabase(pfpClientId, calculation);
        await clientService.updateClient(
            pfpClientId,
            {
                goals_summary: JSON.stringify(calculationResponse),
            },
            bot.project_id
        );

        let pdfUrl = null;
        try {
            pdfUrl = await constructorPfpPersistService.uploadConstructorClientReportPdf({
                clientId: pfpClientId,
                agentId: bot.agent_id,
                projectId: bot.project_id,
            });
        } catch (e) {
            console.warn('[ConstructorAI] /calc pdf upload failed:', e.message || e);
        }

        return {
            calculationResult: calculationResponse,
            pdfUrl: pdfUrl || null,
            firstRunExtraction: null,
            calcInstructionMessage: null,
        };
    }

    /**
     * Шаг 2: Генерация ответа (Послойный промпт)
     */
    async generateResponse(session, command, userMessage, calculationResult = null, responseOptions = {}) {
        const cmdKeyEarly = trimText(command?.command || '').toLowerCase();
        if (isFirstRunCalculationCommand(cmdKeyEarly) && !firstRunCalculationSucceeded(calculationResult)) {
            return FIRST_RUN_CALC_FAILED_USER_MESSAGE;
        }

        const client = await knex('constructor_clients').where('id', session.client_id).first();
        const bot = await knex('constructor_bots').where('id', client.bot_id).first();

        // Получаем активные контексты Мозга (Brain) для конкретного проекта
        const brainContexts = await knex('constructor_brain_contexts')
            .where({
                is_active: true,
                project_id: bot.project_id
            })
            .orderBy('priority', 'desc');

        const baseBrainSection = brainContexts.map(ctx => `--- ${ctx.title} ---\n${ctx.content}`).join('\n\n');

        const historyMessages = await this._loadTurnHistoryAsChatMessages(session.id, GENERATOR_HISTORY_LOG_ROWS);
        const brainSection = await this._buildDynamicConstructorBrainSection(
            bot.project_id,
            userMessage,
            historyMessages,
            baseBrainSection
        );

        const { systemContent, trailingUserCalculationJson } = buildConstructorGeneratorPromptParts(
            bot,
            brainSection,
            command,
            calculationResult,
            client,
            { firstRunExtraction: responseOptions.firstRunExtraction }
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
        const cmdKeyEarly = trimText(command?.command || '').toLowerCase();
        console.log(
            '[ConstructorAI] generateResponseStream enter ' +
                JSON.stringify({
                    cmdKeyEarly,
                    commandId: command?.id ?? null,
                    calcOk: firstRunCalculationSucceeded(calculationResult),
                    isFirstRunCmd: isFirstRunCalculationCommand(cmdKeyEarly),
                    hasCalcPayload: calculationResult != null && typeof calculationResult === 'object',
                })
        );
        if (isFirstRunCalculationCommand(cmdKeyEarly) && !firstRunCalculationSucceeded(calculationResult)) {
            const msg = FIRST_RUN_CALC_FAILED_USER_MESSAGE;
            if (res && typeof res.write === 'function' && !res.writableEnded) {
                res.write(
                    `data: ${JSON.stringify({
                        type: 'calc_error',
                        text: msg,
                        error_code: 'FIRST_RUN_CALC_FAILED',
                    })}\n\n`
                );
                res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                res.end();
            }
            const suffix = streamExtras.appendToFullText || '';
            return suffix ? `${msg}${suffix}` : msg;
        }

        const client = await knex('constructor_clients').where('id', session.client_id).first();
        const bot = await knex('constructor_bots').where('id', client.bot_id).first();

        // Получаем активные контексты Мозга (Brain) для конкретного проекта
        const brainContexts = await knex('constructor_brain_contexts')
            .where({
                is_active: true,
                project_id: bot.project_id
            })
            .orderBy('priority', 'desc');

        const baseBrainSection = brainContexts.map(ctx => `--- ${ctx.title} ---\n${ctx.content}`).join('\n\n');

        const historyMessages = await this._loadTurnHistoryAsChatMessages(session.id, GENERATOR_HISTORY_LOG_ROWS);
        const brainSection = await this._buildDynamicConstructorBrainSection(
            bot.project_id,
            userMessage,
            historyMessages,
            baseBrainSection
        );

        const { systemContent, trailingUserCalculationJson } = buildConstructorGeneratorPromptParts(
            bot,
            brainSection,
            command,
            calculationResult,
            client,
            { firstRunExtraction: streamExtras.firstRunExtraction }
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
        const suffix = streamExtras.appendToFullText || '';
        if (suffix) {
            streamOpts.appendTextBeforeDone = suffix;
        }
        const fullText = await aiService.streamCompletion(layeredPrompt, null, res, streamOpts);

        traceConstructorMeta('step2_generator_llm_response_stream_done', {
            fullTextChars: (fullText || '').length,
            fullTextPreview: truncateTraceText(fullText || '', 1200),
        });

        return fullText || '';
    }

    /**
     * Полный цикл обработки сообщения с SSE стримингом финального ответа.
     * Используется для "чат на сайте" без регистрации.
     */
    async processMessageStream(botId, userId, nickname, userMessage, res) {
        let bot = await knex('constructor_bots').where('id', botId).first();
        if (!bot) return;
        const { backfillConstructorBotAgentId } = require('./constructorSiteChatCrmLinkService');
        bot = await backfillConstructorBotAgentId(bot);

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

        // CRM: сразу завести clients + pfp_client_id — ЛК агента видит site-chat с первого сообщения (не только после расчёта)
        if (!client.pfp_client_id && bot.project_id && bot.agent_id) {
            try {
                const { ensurePfpClientLinkedForConstructorSiteChat } = require('./constructorSiteChatCrmLinkService');
                await ensurePfpClientLinkedForConstructorSiteChat(client, bot, nickname);
                client = await knex('constructor_clients').where('id', client.id).first();
            } catch (linkErr) {
                console.error('[ConstructorAI] ensurePfpClientLinkedForConstructorSiteChat:', linkErr.message || linkErr);
            }
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

        // Сайт-чат SSE: сразу после type=session (контроллер) — результат первого ИИ (роутер / шорткат без LLM).
        if (res && typeof res.write === 'function') {
            res.write(
                `data: ${JSON.stringify({
                    type: 'classifier_command',
                    command: nextCommand?.command ?? null,
                    commandId: nextCommand?.id != null ? nextCommand.id : null,
                    classifierSkipped: !!classifierSkipped,
                })}\n\n`
            );
        }

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
        let calcInstructionMessage = null;
        let pfpReportPdfUrl = null;

        console.log(
            '[ConstructorAI] firstRun(stream): step=after_router ' +
                JSON.stringify({
                    cmdKey,
                    commandId: nextCommand?.id ?? null,
                    commandRaw: nextCommand?.command ?? null,
                    isFirstRunCmd: isFirstRunCalculationCommand(cmdKey),
                    isCalcCmd: isCalcRecalculateCommand(cmdKey),
                })
        );

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
            console.log('[ConstructorAI] firstRun(stream): step=first_run_branch_enter');
            firstRunExtraction = await this.extractFinancialPlanParams(session, userMessage);
            ensureFirstRunExtractionHasPensionGoal(firstRunExtraction);
            if (firstRunExtractionMinimallyValidForCalc(firstRunExtraction)) {
                try {
                    const calcData = {
                        client: buildFirstRunCalcClient(client, firstRunExtraction, bot.project_id),
                        goals: firstRunExtraction.goals || []
                    };
                    console.log(
                        '[ConstructorAI] FirstRun calc payload → calculateFirstRun (site-chat stream):\n',
                        JSON.stringify(calcData, null, 2)
                    );
                    calculationResult = await calculationService.calculateFirstRun(calcData, null, null, {
                        isFirstRun: true,
                        usePool: true,
                    });
                    try {
                        const compactCalc = compactCalculationForPresentationPrompt(calculationResult);
                        console.log(
                            '[ConstructorAI] FirstRun calc response compact (site-chat stream):\n',
                            JSON.stringify(compactCalc, null, 2)
                        );
                    } catch (logErr) {
                        console.warn(
                            '[ConstructorAI] FirstRun calc response compact log failed (stream):',
                            logErr.message || logErr
                        );
                    }
                } catch (calcErr) {
                    console.error('[Flow] FirstRun Calculation failed:', calcErr);
                }
            } else {
                console.warn(
                    '[ConstructorAI] FirstRun (stream): extraction failed minimal validation, skip calculateFirstRun',
                    JSON.stringify({
                        goalsLen: Array.isArray(firstRunExtraction?.goals) ? firstRunExtraction.goals.length : null,
                        hasBirth: !!(firstRunExtraction?.client && trimText(firstRunExtraction.client.birth_date)),
                        hasSex: !!(
                            inferCanonicalSex(firstRunExtraction?.client?.sex) ||
                            inferCanonicalSex(firstRunExtraction?.client?.gender)
                        ),
                        income: firstRunExtraction?.client?.avg_monthly_income,
                    })
                );
            }
            const calcOkFinal = firstRunCalculationSucceeded(calculationResult);
            console.log(
                `[ConstructorAI] firstRun(stream): cmdKey=${cmdKey} calcOk=${calcOkFinal} goalsInExtraction=${Array.isArray(firstRunExtraction?.goals) ? firstRunExtraction.goals.length : 'n/a'}`
            );
        } else if (isCalcRecalculateCommand(cmdKey)) {
            try {
                const recalc = await this.runCalcRecalculateFlow({
                    session,
                    bot,
                    client,
                    userMessage,
                });
                calculationResult = recalc.calculationResult;
                calcInstructionMessage = recalc.calcInstructionMessage;
                if (recalc.pdfUrl) {
                    writeConstructorSiteChatSseData(res, { type: 'pdf_url', pdf_url: recalc.pdfUrl });
                    pfpReportPdfUrl = recalc.pdfUrl;
                }
            } catch (calcErr) {
                console.error('[ConstructorAI] /calc(stream) failed:', calcErr.message || calcErr);
                calcInstructionMessage =
                    'Не удалось выполнить пересчёт прямо сейчас. Попробуйте ещё раз или уточните параметры цели.';
            }
        }

        const calcOkForPersist =
            isFirstRunCalculationCommand(cmdKey) && firstRunCalculationSucceeded(calculationResult) && !!firstRunExtraction;

        if (isFirstRunCalculationCommand(cmdKey) && !calcOkForPersist) {
            const reason = !firstRunExtraction
                ? 'no_firstRunExtraction'
                : !firstRunCalculationSucceeded(calculationResult)
                  ? 'calc_ok_false'
                  : 'unknown';
            console.error(
                '[ConstructorAI] firstRun(stream): persist SKIPPED (precondition) ' +
                    JSON.stringify({
                        reason,
                        cmdKey,
                        calcOk: firstRunCalculationSucceeded(calculationResult),
                        hasExtraction: !!firstRunExtraction,
                        goalsLen: Array.isArray(firstRunExtraction?.goals) ? firstRunExtraction.goals.length : null,
                    })
            );
            writeConstructorSiteChatSseData(res, {
                type: 'persist_status',
                status: 'skipped',
                reason,
                cmdKey,
                calc_ok: firstRunCalculationSucceeded(calculationResult),
            });
        }

        if (calcOkForPersist) {
            try {
                console.log('[ConstructorAI] firstRun(stream): step=persist_enter');
                const botFresh = await knex('constructor_bots').where('id', bot.id).first();
                bot = await backfillConstructorBotAgentId(botFresh || bot);
                client = await knex('constructor_clients').where('id', client.id).first();

                if (!bot?.agent_id || !bot?.project_id) {
                    const detail = {
                        botId: bot?.id,
                        agent_id: bot?.agent_id ?? null,
                        project_id: bot?.project_id ?? null,
                    };
                    console.error(
                        '[ConstructorAI] firstRun(stream): persist skipped — bot missing agent_id or project_id after DB refresh + backfill ' +
                            JSON.stringify(detail)
                    );
                    writeConstructorSiteChatSseData(res, {
                        type: 'persist_status',
                        status: 'skipped',
                        reason: 'bot_missing_agent_id_or_project_id',
                        ...detail,
                    });
                } else {
                    const r = await constructorPfpPersistService.persistConstructorFirstRunAndUploadPdf({
                        constructorClientRow: client,
                        bot,
                        extraction: firstRunExtraction,
                        calculationResponse: calculationResult,
                    });
                    pfpReportPdfUrl = r.pdfUrl;
                    console.log(
                        '[ConstructorAI] firstRun(stream): persist OK ' +
                            JSON.stringify({
                                pfp_client_id: r.clientId,
                                pdf_url_set: !!pfpReportPdfUrl,
                                pdf_url_preview: pfpReportPdfUrl
                                    ? String(pfpReportPdfUrl).slice(0, 120) + (pfpReportPdfUrl.length > 120 ? '…' : '')
                                    : null,
                                agent_id: bot.agent_id,
                                project_id: bot.project_id,
                            })
                    );
                    if (r.clientId != null) {
                        const okPfp = writeConstructorSiteChatSseData(res, {
                            type: 'pfp_client',
                            pfp_client_id: r.clientId,
                            agent_id: Number(bot.agent_id),
                            project_id: Number(bot.project_id),
                        });
                        console.log('[ConstructorAI] firstRun(stream): SSE emitted pfp_client written=' + okPfp);
                    }
                    if (pfpReportPdfUrl) {
                        const okPdf = writeConstructorSiteChatSseData(res, { type: 'pdf_url', pdf_url: pfpReportPdfUrl });
                        console.log('[ConstructorAI] firstRun(stream): SSE emitted pdf_url written=' + okPdf);
                    } else {
                        console.warn(
                            '[ConstructorAI] firstRun(stream): persist OK but pdf_url empty (R2/JWT/PFP_PUBLIC_API_BASE_URL)'
                        );
                    }
                    writeConstructorSiteChatSseData(res, {
                        type: 'persist_status',
                        status: 'ok',
                        pfp_client_id: r.clientId,
                        pdf_url_set: !!pfpReportPdfUrl,
                    });
                }
            } catch (persistErr) {
                console.error(
                    '[ConstructorAI] persistConstructorFirstRun (stream) failed:',
                    persistErr.message || persistErr
                );
                writeConstructorSiteChatSseData(res, {
                    type: 'persist_status',
                    status: 'failed',
                    message: String(persistErr.message || persistErr).slice(0, 500),
                });
            }
        }

        console.log(
            '[ConstructorAI] firstRun(stream): step=before_generator ' +
                JSON.stringify({
                    cmdKey,
                    generatorCommand: nextCommand?.command ?? null,
                    generatorCommandId: nextCommand?.id ?? null,
                    pdfInResponse: !!pfpReportPdfUrl,
                })
        );

        const pdfSuffix = pfpReportPdfUrl ? `\n\n📄 Ваш персональный отчёт (PDF): ${pfpReportPdfUrl}` : '';
        // 2) Стриминг ответа
        let responseText;
        if (calcInstructionMessage) {
            responseText = `${calcInstructionMessage}${pdfSuffix}`;
            if (res && typeof res.write === 'function' && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'text', content: responseText })}\n\n`);
                res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                res.end();
            }
        } else {
            responseText = await this.generateResponseStream(
                session,
                nextCommand || { response: '' },
                userMessage,
                calculationResult,
                res,
                {
                    trailingSsePayload: pfpReportPdfUrl ? { type: 'pdf_url', pdf_url: pfpReportPdfUrl } : null,
                    appendToFullText: pdfSuffix,
                    firstRunExtraction,
                }
            );
        }

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
        let bot = await knex('constructor_bots').where('id', botId).first();
        if (!bot) return "Бот не найден.";
        const { backfillConstructorBotAgentId } = require('./constructorSiteChatCrmLinkService');
        bot = await backfillConstructorBotAgentId(bot);

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
        let calcInstructionMessage = null;
        let pfpReportPdfUrl = null;

        // Нормализация команды для сравнения (убираем регистр и пробелы)
        const cmdKey = nextCommand ? nextCommand.command.trim().toLowerCase() : '';
        console.log(
            `[Flow] Command for this turn: "${nextCommand ? nextCommand.command : 'null'}" (cmdKey: ${cmdKey}); will run calculation: ${cmdKey === '/homeownerscalc' || isFirstRunCalculationCommand(cmdKey) || isCalcRecalculateCommand(cmdKey)}`
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
            ensureFirstRunExtractionHasPensionGoal(firstRunExtraction);
            console.log(`[Flow] Performing Full Financial Plan Calculation for client:`, client.nickname);
            console.log(`[Flow] Extraction Result:`, JSON.stringify(firstRunExtraction, null, 2));

            if (firstRunExtractionMinimallyValidForCalc(firstRunExtraction)) {
                try {
                    const calcData = {
                        client: buildFirstRunCalcClient(client, firstRunExtraction, bot.project_id),
                        goals: firstRunExtraction.goals || []
                    };

                    console.log(
                        '[ConstructorAI] FirstRun calc payload → calculateFirstRun (telegram/max):\n',
                        JSON.stringify(calcData, null, 2)
                    );
                    calculationResult = await calculationService.calculateFirstRun(calcData, null, null, {
                        isFirstRun: true,
                        usePool: true,
                    });
                    console.log(`[Flow] FirstRun Calculation Success. Total Capital: ${calculationResult.summary?.total_capital}`);
                    try {
                        const compactCalc = compactCalculationForPresentationPrompt(calculationResult);
                        console.log(
                            '[ConstructorAI] FirstRun calc response compact (telegram/max):\n',
                            JSON.stringify(compactCalc, null, 2)
                        );
                    } catch (logErr) {
                        console.warn(
                            '[ConstructorAI] FirstRun calc response compact log failed (telegram):',
                            logErr.message || logErr
                        );
                    }
                } catch (calcErr) {
                    console.error('[Flow] FirstRun Calculation failed:', calcErr);
                }
            } else {
                console.warn(
                    '[ConstructorAI] FirstRun (telegram): extraction failed minimal validation, skip calculateFirstRun'
                );
            }
            console.log(
                `[ConstructorAI] firstRun(telegram): cmdKey=${cmdKey} calcOk=${firstRunCalculationSucceeded(calculationResult)} goalsInExtraction=${Array.isArray(firstRunExtraction?.goals) ? firstRunExtraction.goals.length : 'n/a'}`
            );
        } else if (isCalcRecalculateCommand(cmdKey)) {
            try {
                const recalc = await this.runCalcRecalculateFlow({
                    session,
                    bot,
                    client,
                    userMessage,
                });
                calculationResult = recalc.calculationResult;
                calcInstructionMessage = recalc.calcInstructionMessage;
                if (recalc.pdfUrl) {
                    pfpReportPdfUrl = recalc.pdfUrl;
                }
            } catch (calcErr) {
                console.error('[ConstructorAI] /calc(telegram) failed:', calcErr.message || calcErr);
                calcInstructionMessage =
                    'Не удалось выполнить пересчёт прямо сейчас. Попробуйте ещё раз или уточните параметры цели.';
            }
        } else {
            console.log(
                `[Flow] DEBUG: Command ${nextCommand ? nextCommand.command : 'null'} did not match /homeownerscalc or first-run keys (/firstrun, /firstRunAIB2C, …)`
            );
        }

        if (
            isFirstRunCalculationCommand(cmdKey) &&
            firstRunCalculationSucceeded(calculationResult) &&
            firstRunExtraction
        ) {
            try {
                const r = await constructorPfpPersistService.persistConstructorFirstRunAndUploadPdf({
                    constructorClientRow: client,
                    bot,
                    extraction: firstRunExtraction,
                    calculationResponse: calculationResult,
                });
                pfpReportPdfUrl = r.pdfUrl;
                console.log(
                    `[ConstructorAI] firstRun(telegram): persist OK pfp_client_id=${r.clientId} pdfUrl=${pfpReportPdfUrl ? 'set' : 'MISSING'}`
                );
            } catch (persistErr) {
                console.error('[ConstructorAI] persistConstructorFirstRun failed:', persistErr.message || persistErr);
            }
        }

        // 2. Генерация ответа
        let responseText = calcInstructionMessage
            ? calcInstructionMessage
            : await this.generateResponse(session, nextCommand, userMessage, calculationResult, {
                  firstRunExtraction,
              });
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

/**
 * Сборка массива messages как у generateResponse для firstRun (скрипт context_primer_gemini_smoke, отладка).
 * @param {Object} opts
 * @param {Object} opts.calculationResult — результат calculateFirstRun (после simplify или сырой)
 * @param {Object} [opts.bot]
 * @param {string} [opts.brainSection]
 * @param {Object} [opts.command] — строка команды сценария, например { command: '/firstrun', response: '...' }
 * @param {Object} [opts.client] — constructor_clients row (nickname, user_context)
 * @param {string} [opts.userMessage]
 * @param {Array<{role:string,content:string}>} [opts.historyMessages]
 * @param {Object|null} [opts.firstRunExtraction] — как из extractFinancialPlanParams
 */
function buildFirstRunLayeredMessagesForSmoke(opts = {}) {
    const {
        calculationResult,
        bot = {
            name: 'Финансовый ассистент PFP',
            base_brain_context: 'Ты помогаешь клиенту понять персональный финансовый план.',
            communication_style: 'Профессионально, тепло, без канцелярита.',
        },
        brainSection = '--- Продукт ---\nДолгосрочные накопления через НПФ и налоговые льготы.',
        command = {
            command: '/firstrun',
            response:
                'Пенсия: заголовок «Основная цель: Достойная пенсия». Сначала доходы (желаемый, госпенсия, доп. доход «сегодня»), потом фраза про инфляцию и pension_gap_future (номинал к пенсии), только затем объясни зачем капитал projected_capital_at_retirement и пополнение. Налоги по JSON; PDF одной строкой.',
        },
        client = { nickname: 'Саша', user_context: '' },
        userMessage = '50000 на старте, хочу 100 тысяч на пенсию',
        historyMessages = [
            { role: 'user', content: 'Привет' },
            {
                role: 'assistant',
                content: 'Здравствуйте! Какой у вас текущий доход в месяц и сколько уже отложено?',
            },
            { role: 'user', content: '180 тысяч доход, накопления 50 тысяч' },
            {
                role: 'assistant',
                content: 'Какую пенсию в месяц вы хотели бы получать в ценах сегодняшнего дня?',
            },
        ],
        firstRunExtraction = null,
    } = opts;

    if (!calculationResult || typeof calculationResult !== 'object') {
        throw new Error('buildFirstRunLayeredMessagesForSmoke: calculationResult обязателен');
    }

    const { systemContent, trailingUserCalculationJson } = buildConstructorGeneratorPromptParts(
        bot,
        brainSection,
        command,
        calculationResult,
        client,
        { firstRunExtraction }
    );

    const layered = [];
    if (trimText(systemContent)) {
        layered.push({ role: 'system', content: trimText(systemContent) });
    }
    layered.push(...(historyMessages || []));
    layered.push({ role: 'user', content: userMessage || '' });
    if (trailingUserCalculationJson) {
        layered.push({
            role: 'user',
            content:
                'Служебное сообщение (не показывать пользователю как цитату): расчёт УЖЕ выполнен. Ниже JSON — единственный источник цифр для ответа.\n\nРезультат расчёта (JSON):\n' +
                trailingUserCalculationJson,
        });
    }
    return layered;
}

const constructorAiServiceSingleton = new ConstructorAiService();
constructorAiServiceSingleton.buildFirstRunLayeredMessagesForSmoke = buildFirstRunLayeredMessagesForSmoke;
module.exports = constructorAiServiceSingleton;
