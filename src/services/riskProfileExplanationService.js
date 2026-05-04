const crypto = require('crypto');
const aiService = require('./aiService');

const EXPLANATION_VERSION = 'v2';
const CACHE_TTL_MS = 1000 * 60 * 30;

function stableJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map((v) => stableJson(v)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function cleanText(value, maxLength = 1200) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

class RiskProfileExplanationService {
    constructor() {
        this.cache = new Map();
    }

    async build({
        riskProfileResult,
        answerMap = {},
        questionnaire = null,
        projectId = null,
        goalsPortfolioRisk = null
    }) {
        if (!riskProfileResult || typeof riskProfileResult !== 'object') return null;

        const goalsDigest = Array.isArray(goalsPortfolioRisk) ? goalsPortfolioRisk : [];

        const sourceHash = this._buildSourceHash(riskProfileResult, answerMap, questionnaire, goalsDigest);
        const cached = this.cache.get(sourceHash);
        if (cached && (Date.now() - cached.ts) <= CACHE_TTL_MS) {
            return { ...cached.payload };
        }

        const humanAnswers = this._collectHumanAnswers(answerMap, questionnaire);
        const fallback = this._buildFallback(riskProfileResult, humanAnswers, sourceHash, goalsDigest);

        if (!this._isAiEnabled()) {
            this.cache.set(sourceHash, { ts: Date.now(), payload: fallback });
            return fallback;
        }

        try {
            const messages = this._buildPromptMessages({
                riskProfileResult,
                questionnaireCode: questionnaire?.code || null,
                humanAnswers,
                goalsPortfolioRisk: goalsDigest
            });
            const model = this._resolveModel(projectId);
            const raw = await aiService.getCompletion(messages, model);
            const parsed = this._parseModelJson(raw);
            const normalized = this._normalizeParsed(parsed, sourceHash);
            this.cache.set(sourceHash, { ts: Date.now(), payload: normalized });
            return normalized;
        } catch (error) {
            console.warn('[RiskProfileExplanation] fallback used:', error.message);
            this.cache.set(sourceHash, { ts: Date.now(), payload: fallback });
            return fallback;
        }
    }

    _isAiEnabled() {
        return String(process.env.AI_RISK_PROFILE_EXPLANATION_ENABLED || 'true').toLowerCase() !== 'false';
    }

    _resolveModel(_projectId) {
        return process.env.OPENROUTER_MODEL_RISK_PROFILE_EXPLANATION || process.env.OPENROUTER_MODEL || null;
    }

    _buildSourceHash(riskProfileResult, answerMap, questionnaire, goalsPortfolioRisk = []) {
        const source = stableJson({
            risk_profile_result: riskProfileResult,
            risk_profile_answers: answerMap,
            questionnaire_code: questionnaire?.code || null,
            questionnaire_version_id: questionnaire?.id || null,
            goals_portfolio_risk: goalsPortfolioRisk
        });
        return `sha256:${crypto.createHash('sha256').update(source, 'utf8').digest('hex')}`;
    }

    _collectHumanAnswers(answerMap, questionnaire) {
        if (!questionnaire || !Array.isArray(questionnaire.questions)) return [];
        return questionnaire.questions
            .map((question) => {
                const selectedCode = answerMap[question.code];
                if (!selectedCode || !Array.isArray(question.options)) return null;
                const selectedOption = question.options.find((opt) => String(opt.code) === String(selectedCode));
                if (!selectedOption) return null;
                return {
                    question_code: question.code,
                    question: question.title,
                    answer_code: selectedOption.code,
                    answer: selectedOption.label
                };
            })
            .filter(Boolean);
    }

    _buildPromptMessages({ riskProfileResult, questionnaireCode, humanAnswers, goalsPortfolioRisk = [] }) {
        const systemPrompt = [
            'Ты финансовый ассистент PFP.',
            'Задача: объяснить риск-профиль клиента с учётом портфеля целей понятным и аккуратным языком.',
            'Жесткие правила:',
            '1) Используй только данные из входного JSON, не выдумывай факты.',
            '2) Не пересчитывай score и не меняй риск-профиль из backend.',
            '   Поле risk_profile_result — эталонный срез для одной опорной цели (как в расчёте).',
            '   Массив goals_portfolio_risk — риск по каждой цели после backend; уровни могут различаться из‑за горизонта (term_months) и ограничений.',
            '   Не противоречь ни risk_profile_result, ни ни одной строке goals_portfolio_risk: подписи risk_profile / risk_profile_extended и final_score брать только из JSON.',
            '3) Не обещай доходность и не давай гарантий.',
            '4) Верни строго JSON-объект без markdown и без пояснений вокруг.',
            '5) Поля JSON:',
            '{',
            '  "title": string,',
            '  "summary": string,',
            '  "key_factors": string[],',
            '  "recommendations": string[],',
            '  "caution": string,',
            '  "agent_note": string',
            '}',
            'Ограничения:',
            '- title до 90 символов;',
            '- summary 2-4 предложения;',
            '- key_factors 3-5 пунктов;',
            '- recommendations 3-5 пунктов;',
            '- caution 1-2 предложения;',
            '- agent_note 2-4 предложения.',
            'Если goals_portfolio_risk непустой: в summary кратко отрази общую картину и различия между целями; первая строка массива — порядок приоритета как в расчёте.'
        ].join('\n');

        const payload = {
            risk_profile_result: {
                risk_profile: riskProfileResult.risk_profile || null,
                risk_profile_extended: riskProfileResult.risk_profile_extended || null,
                base_score: riskProfileResult.base_score ?? null,
                behavior_score: riskProfileResult.behavior_score ?? null,
                behavior_coefficient: riskProfileResult.behavior_coefficient ?? null,
                final_score: riskProfileResult.final_score ?? null,
                max_final_score_by_capacity: riskProfileResult.max_final_score_by_capacity ?? null,
                explanation: riskProfileResult.explanation || null
            },
            goals_portfolio_risk: goalsPortfolioRisk,
            questionnaire: {
                version_code: questionnaireCode,
                answers_human: humanAnswers
            },
            tone: 'calm_clear'
        };

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Сформируй пояснение по риск-профилю клиента.\n\nВХОД:\n${JSON.stringify(payload, null, 2)}` }
        ];
    }

    _parseModelJson(rawText) {
        const raw = String(rawText || '').trim();
        if (!raw) throw new Error('Empty AI response');

        const fromFence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fromFence ? fromFence[1].trim() : raw;

        try {
            return JSON.parse(candidate);
        } catch (_) {
            const objectMatch = candidate.match(/\{[\s\S]*\}/);
            if (!objectMatch) throw new Error('AI response is not valid JSON');
            return JSON.parse(objectMatch[0]);
        }
    }

    _normalizeParsed(parsed, sourceHash) {
        const keyFactors = Array.isArray(parsed?.key_factors)
            ? parsed.key_factors.map((v) => cleanText(v, 260)).filter(Boolean).slice(0, 5)
            : [];
        const recommendations = Array.isArray(parsed?.recommendations)
            ? parsed.recommendations.map((v) => cleanText(v, 260)).filter(Boolean).slice(0, 5)
            : [];

        if (!cleanText(parsed?.title, 90) || !cleanText(parsed?.summary, 1200)) {
            throw new Error('AI response missing title/summary');
        }
        if (keyFactors.length < 2 || recommendations.length < 2) {
            throw new Error('AI response missing key arrays');
        }

        return {
            version: EXPLANATION_VERSION,
            generated_at: new Date().toISOString(),
            source_hash: sourceHash,
            title: cleanText(parsed.title, 90),
            summary: cleanText(parsed.summary, 1200),
            key_factors: keyFactors,
            recommendations,
            caution: cleanText(parsed.caution, 420),
            agent_note: cleanText(parsed.agent_note, 900)
        };
    }

    _buildFallback(riskProfileResult, humanAnswers, sourceHash, goalsPortfolioRisk = []) {
        const profile = String(riskProfileResult?.risk_profile_extended || riskProfileResult?.risk_profile || 'UNKNOWN');
        const baseScore = Number(riskProfileResult?.base_score);
        const behaviorScore = Number(riskProfileResult?.behavior_score);
        const finalScore = Number(riskProfileResult?.final_score);

        const factors = [];
        if (Number.isFinite(baseScore)) {
            factors.push(`Базовая финансовая емкость риска: ${baseScore.toFixed(2)} по внутренней шкале.`);
        }
        if (Number.isFinite(behaviorScore)) {
            factors.push(`Поведенческий блок: ${behaviorScore.toFixed(2)} — учитывает реакцию на просадки и неопределенность.`);
        }
        if (Number.isFinite(finalScore)) {
            factors.push(`Итоговый скоринг после корректировки: ${finalScore.toFixed(2)}.`);
        }
        if (humanAnswers[0]) {
            factors.push(`Ключевой поведенческий сигнал: "${humanAnswers[0].answer}".`);
        }

        const multiLine = goalsPortfolioRisk.length > 1
            ? ` По целям портфеля backend назначил разные уровни риска (см. goals_portfolio_risk); эталонный срез для карточки клиента — ${profile}.`
            : '';

        const summary = [
            `Итоговый риск-профиль (опорная цель) определен как ${profile}.${multiLine}`,
            'Результат учитывает одновременно финансовые параметры клиента и поведенческую устойчивость.',
            'Такой подход снижает риск решений на эмоциях в периоды рыночной волатильности.'
        ].join(' ');

        return {
            version: EXPLANATION_VERSION,
            generated_at: new Date().toISOString(),
            source_hash: sourceHash,
            title: 'Пояснение по риск-профилю клиента',
            summary,
            key_factors: factors.slice(0, 5),
            recommendations: [
                'Ориентироваться на согласованную стратегию и заранее зафиксированные правила ребалансировки.',
                'Пересматривать риск-профиль при изменении срока цели, доходов или обязательств.',
                'Сохранять дисциплину в периоды волатильности, чтобы не разрушать долгосрочный план.'
            ],
            caution: 'Пояснение носит информационный характер и не является гарантией доходности.',
            agent_note: 'Используйте текст как основу для коммуникации с клиентом: коротко объясните, какие факторы усилили или снизили итоговый риск-профиль.'
        };
    }
}

module.exports = new RiskProfileExplanationService();
