const aiService = require('./aiService');
const clientService = require('./clientService');
const calculationService = require('./calculationService');
const goalRecalculator = require('../algorithms/recalculators');
const { patchHasExplicitManualGoalRisk, applyManualGoalRiskSanitize } = require('../utils/goalManualRisk');
const { syncCalculationGoalsWithDatabase } = require('./clientGoalSyncService');
const constructorPfpPersistService = require('./constructorPfpPersistService');

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
    '- если пользователь явно назвал сумму ежемесячного пополнения/взноса — запиши это в goal_patch.monthly_replenishment;',
    '- числа отдавай числами, не строками.',
    '',
    'Пенсия / госпенсия (goal_type_id 1):',
    '- текущий ИПК (баллы) — в goal_patch.ipk_current или client_patch.ipk_current (если явно про «мой ИПК в ПФР»);',
    '- накопления на ОПС (руб.) — в первую очередь goal_patch.ops_capital (в client_patch тоже можно — сервер перенесёт в цель);',
    '- желаемая пенсия в месяц — goal_patch.desired_monthly_income или target_amount (числа в «сегодняшних» рублях, как в цели).',
].join('\n');

function trimText(v) {
    if (v == null) return '';
    return String(v).trim();
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function pickFirstNonEmpty(...values) {
    for (const value of values) {
        if (value === 0 || value === '0') return value;
        if (value != null && String(value).trim() !== '') return value;
    }
    return null;
}

function parseJsonFromLlm(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return {};
    const direct = (() => {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    })();
    if (direct && typeof direct === 'object') return direct;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    try {
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        return {};
    }
}

function toFiniteNumberOrOriginal(value) {
    if (value == null || value === '') return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
}

function normalizeRecalculatePatch(extracted) {
    const payload = extracted && typeof extracted === 'object' ? extracted : {};
    const targetGoal = payload.target_goal && typeof payload.target_goal === 'object' ? { ...payload.target_goal } : {};
    const goalPatchRaw = payload.goal_patch && typeof payload.goal_patch === 'object' ? payload.goal_patch : {};
    const clientPatchRaw = payload.client_patch && typeof payload.client_patch === 'object' ? payload.client_patch : {};
    const needsClarification = Boolean(payload.needs_clarification);
    const clarificationQuestion = trimText(payload.clarification_question);

    const normalizePatchObject = (obj, numericKeys = []) => {
        const out = {};
        Object.keys(obj || {}).forEach((key) => {
            const v = obj[key];
            if (v === undefined) return;
            if (v === null || v === '') {
                out[key] = v;
                return;
            }
            if (numericKeys.includes(key)) {
                out[key] = toFiniteNumberOrOriginal(v);
                return;
            }
            out[key] = v;
        });
        return out;
    };

    const goalPatch = normalizePatchObject(goalPatchRaw, [
        'id',
        'goal_id',
        'goal_type_id',
        'target_amount',
        'desired_monthly_income',
        'term_months',
        'monthly_replenishment',
        'initial_capital',
        'ops_capital',
        'ipk_current',
        'inflation_rate',
        'risk_profile',
    ]);
    const clientPatch = normalizePatchObject(clientPatchRaw, [
        'avg_monthly_income',
        'total_liquid_capital',
        'ipk_current',
        'ops_capital',
    ]);

    if (hasOwn(goalPatch, 'monthly_replenishment')) {
        goalPatch.monthly_replenishment = toFiniteNumberOrOriginal(goalPatch.monthly_replenishment);
    }

    if (targetGoal.id != null && targetGoal.id !== '') targetGoal.id = toFiniteNumberOrOriginal(targetGoal.id);
    if (targetGoal.goal_type_id != null && targetGoal.goal_type_id !== '') {
        targetGoal.goal_type_id = toFiniteNumberOrOriginal(targetGoal.goal_type_id);
    }
    if (targetGoal.name != null) targetGoal.name = trimText(targetGoal.name);

    return {
        target_goal: targetGoal,
        goal_patch: goalPatch,
        client_patch: clientPatch,
        needs_clarification: needsClarification,
        clarification_question: clarificationQuestion,
    };
}

function normalizeDbGoalForRecalculate(goal) {
    if (!goal || typeof goal !== 'object') return {};
    const merged = { ...goal };
    let fromParams = {};
    if (typeof goal.params === 'string') {
        try {
            fromParams = JSON.parse(goal.params);
        } catch (e) {
            fromParams = {};
        }
    } else if (goal.params && typeof goal.params === 'object') {
        fromParams = goal.params;
    }
    const out = { ...fromParams, ...merged };
    const numericFields = [
        'id',
        'goal_id',
        'goal_type_id',
        'target_amount',
        'desired_monthly_income',
        'term_months',
        'monthly_replenishment',
        'initial_capital',
        'ipk_current',
        'ipk_forecast',
        'ipk_total',
        'ops_capital',
        'inflation_rate',
    ];
    numericFields.forEach((field) => {
        if (out[field] !== undefined && out[field] !== null && out[field] !== '') {
            const n = Number(out[field]);
            if (Number.isFinite(n)) out[field] = n;
        }
    });
    return out;
}

function userExplicitlyChangedMonthlyReplenishment(userMessage, goalPatch, existingGoal = null) {
    if (hasOwn(goalPatch, 'monthly_replenishment')) {
        const next = Number(goalPatch.monthly_replenishment);
        const prev = Number(existingGoal?.monthly_replenishment);
        const bothFinite = Number.isFinite(next) && Number.isFinite(prev);
        if (!bothFinite) return true;
        if (Math.abs(next - prev) > 0.000001) return true;
    }
    const text = String(userMessage || '').toLowerCase();
    if (!text) return false;
    const monthlyKeywords = [
        'пополн',
        'платеж',
        'платёж',
        'взнос',
        'вносить',
        'в месяц',
        '/мес',
        'ежемесяч',
        'каждый месяц',
    ];
    return monthlyKeywords.some((kw) => text.includes(kw));
}

function shouldUseReverseModeByGoalPatch(goalPatch) {
    const reverseTriggerKeys = ['initial_capital', 'inflation_rate', 'target_amount', 'desired_monthly_income', 'term_months'];
    return reverseTriggerKeys.some((key) => hasOwn(goalPatch, key));
}

function simplifyCalcPayload(calculationResult) {
    if (!calculationResult || typeof calculationResult !== 'object') return calculationResult;
    try {
        const cloned = JSON.parse(JSON.stringify(calculationResult));
        return calculationService.simplify(cloned);
    } catch (e) {
        return calculationResult;
    }
}

function buildCalcAiTrailingPayload(calculationResult) {
    return {
        mode: 'recalculate',
        calculation: simplifyCalcPayload(calculationResult),
    };
}

function buildHistoryTextFromPairs(historyPairs) {
    return (historyPairs || [])
        .map((row) => `User: ${row.user || ''}\nAssistant: ${row.assistant || ''}`.trim())
        .join('\n');
}

async function extractRecalculatePatch({ userMessage, goalsForPrompt = [], historyText = '' }) {
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
        return normalizeRecalculatePatch(parseJsonFromLlm(raw));
    } catch (err) {
        console.error('[CalcRecalculateFlow] extract patch failed:', err.message || err);
        return {
            target_goal: {},
            goal_patch: {},
            client_patch: {},
            needs_clarification: true,
            clarification_question: 'Уточните, какую цель пересчитать и какие параметры поменялись.',
        };
    }
}

async function runCalcRecalculateFlow({
    pfpClientId,
    projectId,
    userMessage,
    historyPairs = [],
    agentId = null,
    uploadPdf = true,
}) {
    const numericClientId = Number(pfpClientId);
    if (!numericClientId) {
        return {
            calculationResult: null,
            pdfUrl: null,
            patchPayload: null,
            calcInstructionMessage:
                'Для пересчёта сначала нужен стартовый план. Давайте сначала сделаем /firstRunAIB2C, потом вернёмся к /calc.',
        };
    }

    const existingClient = await clientService.getFullClient(numericClientId, projectId);
    if (!existingClient || !Array.isArray(existingClient.goals) || existingClient.goals.length === 0) {
        return {
            calculationResult: null,
            pdfUrl: null,
            patchPayload: null,
            calcInstructionMessage: 'Не нашёл сохранённый план для пересчёта. Давайте сначала пересоберём first run.',
        };
    }

    const existingGoals = existingClient.goals.map(normalizeDbGoalForRecalculate);
    const goalsForPrompt = existingGoals.map((g) => ({
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
    }));
    const historyText = buildHistoryTextFromPairs(historyPairs);
    const patchPayload = await extractRecalculatePatch({ userMessage, goalsForPrompt, historyText });

    if (patchPayload.needs_clarification) {
        return {
            calculationResult: null,
            pdfUrl: null,
            patchPayload,
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
    if (!targetGoalId && existingGoals.length === 1 && existingGoals[0]?.id != null) {
        targetGoalId = String(existingGoals[0].id);
    }
    if (!targetGoalId || !goalsMap.has(targetGoalId)) {
        return {
            calculationResult: null,
            pdfUrl: null,
            patchPayload,
            calcInstructionMessage: 'Не смогла однозначно определить цель для пересчёта. Напишите точнее: какая цель и что меняем.',
        };
    }

    const existingGoal = goalsMap.get(targetGoalId);
    const goalPatch = { ...(patchPayload.goal_patch || {}) };
    delete goalPatch.id;
    delete goalPatch.goal_id;

    const reverseCandidateGoalTypes = new Set([1, 2, 4]);
    const goalTypeIdForMode = Number(existingGoal?.goal_type_id);
    const hasReverseTriggerChange = shouldUseReverseModeByGoalPatch(goalPatch);
    const hasExplicitMonthlyChange = userExplicitlyChangedMonthlyReplenishment(userMessage, goalPatch, existingGoal);
    const shouldForceReverseMode =
        reverseCandidateGoalTypes.has(goalTypeIdForMode) && hasReverseTriggerChange && !hasExplicitMonthlyChange;

    if (shouldForceReverseMode) {
        goalPatch.monthly_replenishment = null;
    }

    const clientPatch = { ...(patchPayload.client_patch || {}) };
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
    const explicitManualRiskForTarget = patchHasExplicitManualGoalRisk(goalPatch);
    applyManualGoalRiskSanitize(updatedGoal, goalPatch);
    goalsMap.set(targetGoalId, updatedGoal);

    const clientForCalc = {
        ...existingClient,
        ...clientPatch,
        assets: clientPatch.assets || existingClient.assets || [],
        total_liquid_capital:
            clientPatch.total_liquid_capital !== undefined
                ? clientPatch.total_liquid_capital
                : existingClient.total_liquid_capital,
        project_id: projectId,
    };
    const calcRequest = { client: clientForCalc, goals: Array.from(goalsMap.values()) };
    const previousCalculation = existingClient.goals_summary || null;
    const calculationResponse = await calculationService.calculateFirstRun(calcRequest, targetGoalId, previousCalculation, {
        isFirstRun: false,
        usePool: false,
        explicitManualRiskForTarget,
    });
    const calculation = calculationResponse.calculation || calculationResponse;
    const calculatedGoals = calculation?.goals || [];
    const calculatedTargetGoal = calculatedGoals.find(
        (goalResult) => String(goalResult?.goal_id || goalResult?.id || '') === String(targetGoalId)
    );
    const persistedGoalData = goalsMap.get(targetGoalId);

    if (calculatedTargetGoal?.summary && persistedGoalData) {
        const summary = calculatedTargetGoal.summary;
        const goalTypeId = Number(persistedGoalData?.goal_type_id);
        const isForwardMode = Number(persistedGoalData?.monthly_replenishment) > 0;

        if (summary.monthly_replenishment != null && Number.isFinite(Number(summary.monthly_replenishment))) {
            persistedGoalData.monthly_replenishment = Number(summary.monthly_replenishment);
        }
        if (isForwardMode) {
            if (summary.target_amount_initial != null) {
                persistedGoalData.target_amount = Number(summary.target_amount_initial);
            }
            if (goalTypeId === 1 || goalTypeId === 2) {
                persistedGoalData.desired_monthly_income = Number(summary.target_amount_initial || 0);
            }
        }
    }

    await clientService.updateGoal(numericClientId, targetGoalId, persistedGoalData);
    if (Object.keys(clientPatch).length > 0) {
        await clientService.updateClient(numericClientId, clientPatch, projectId);
    }
    await syncCalculationGoalsWithDatabase(numericClientId, calculation);
    await clientService.updateClient(
        numericClientId,
        { goals_summary: JSON.stringify(calculationResponse) },
        projectId
    );

    let pdfUrl = null;
    if (uploadPdf && agentId && projectId) {
        try {
            pdfUrl = await constructorPfpPersistService.uploadConstructorClientReportPdf({
                clientId: numericClientId,
                agentId,
                projectId,
            });
        } catch (e) {
            console.warn('[CalcRecalculateFlow] /calc pdf upload failed:', e.message || e);
        }
    }

    return {
        calculationResult: calculationResponse,
        pdfUrl: pdfUrl || null,
        patchPayload,
        calcInstructionMessage: null,
    };
}

module.exports = {
    runCalcRecalculateFlow,
    extractRecalculatePatch,
    normalizeRecalculatePatch,
    buildCalcAiTrailingPayload,
    simplifyCalcPayload,
};
