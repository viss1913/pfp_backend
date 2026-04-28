const knex = require('../config/database');

const DEFAULT_INCOME_STABILITY_SCORE = 3;

class RiskQuestionnaireService {
    async getActiveQuestionnaire(projectId = null) {
        const data = await this._loadQuestionnaireData(projectId);
        if (!data) return null;
        const { version, questions, optionsByQuestion } = data;

        const formattedQuestions = questions.map((q) => ({
            id: q.id,
            code: q.code,
            title: q.title,
            description: q.description,
            help_text: q.help_text,
            category: q.category,
            sort_order: q.sort_order,
            options: (optionsByQuestion.get(q.id) || []).map((opt) => ({
                id: opt.id,
                code: opt.code,
                label: opt.label,
                score: Number(opt.score),
                sort_order: opt.sort_order
            }))
        }));

        return {
            id: version.id,
            code: version.code,
            name: version.name,
            description: version.description,
            project_id: version.project_id,
            questions: formattedQuestions
        };
    }

    async getActiveQuestionnaireV2(projectId = null) {
        const data = await this._loadQuestionnaireData(projectId);
        if (!data) return null;
        const { version, questions, optionsByQuestion } = data;

        const formattedQuestions = questions.map((q) => ({
            code: q.code,
            title: q.title,
            description: q.description,
            help_text: q.help_text,
            sort_order: q.sort_order,
            options: (optionsByQuestion.get(q.id) || []).map((opt) => ({
                code: opt.code,
                label: opt.label,
                sort_order: opt.sort_order
            }))
        }));

        return {
            id: version.id,
            code: version.code,
            name: version.name,
            description: version.description,
            questions: formattedQuestions
        };
    }

    normalizeAnswerMap(rawAnswers, questionnaire) {
        if (!rawAnswers || typeof rawAnswers !== 'object' || !questionnaire) return {};
        const normalized = {};

        questionnaire.questions.forEach((question) => {
            const directValue = rawAnswers[question.code];
            const legacyQValue = rawAnswers[`q${question.sort_order}`];
            const submitted = directValue !== undefined ? directValue : legacyQValue;

            if (submitted === undefined || submitted === null || submitted === '') return;

            const matchedOption = this._findOption(question.options, submitted);
            if (matchedOption) {
                normalized[question.code] = matchedOption.code;
            }
        });

        return normalized;
    }

    computeBehaviorScore(answerMap, questionnaire) {
        if (!questionnaire || !Array.isArray(questionnaire.questions) || questionnaire.questions.length === 0) {
            return null;
        }

        let sum = 0;
        let count = 0;
        const details = [];

        questionnaire.questions.forEach((question) => {
            const optionCode = answerMap[question.code];
            if (!optionCode) return;
            const option = question.options.find((item) => item.code === optionCode);
            if (!option) return;
            const score = Number(option.score);
            if (!Number.isFinite(score)) return;
            sum += score;
            count += 1;
            details.push({
                question_code: question.code,
                option_code: option.code,
                option_label: option.label,
                score
            });
        });

        if (count === 0) return null;
        const avgScore = sum / count;
        return {
            questions_answered: count,
            score_sum: sum,
            average_score: Number(avgScore.toFixed(3)),
            details
        };
    }

    getIncomeStabilityScore(client = {}) {
        const familyProfile = client.family_profile && typeof client.family_profile === 'object'
            ? client.family_profile
            : {};
        const spouse = familyProfile.spouse || {};
        const clientIncome = Number(client.avg_monthly_income || 0);
        const spouseIncome = Number(spouse.monthly_income || client.spouse_avg_monthly_income || 0);
        const totalIncome = clientIncome + spouseIncome;
        if (totalIncome <= 0) return DEFAULT_INCOME_STABILITY_SCORE;

        const hasSpouseIncome = spouseIncome > 0;
        const hasSingleStableSource = clientIncome > 0;
        if (hasSpouseIncome && hasSingleStableSource) return 5;
        if (hasSingleStableSource) return 4;
        return DEFAULT_INCOME_STABILITY_SCORE;
    }

    async _findActiveVersion(projectId) {
        if (projectId != null) {
            const projectVersion = await knex('risk_questionnaire_versions')
                .where({ project_id: Number(projectId), is_active: true })
                .orderBy('id', 'desc')
                .first();
            if (projectVersion) return projectVersion;
        }

        return knex('risk_questionnaire_versions')
            .whereNull('project_id')
            .andWhere({ is_active: true })
            .orderBy('id', 'desc')
            .first();
    }

    async _loadQuestionnaireData(projectId) {
        const version = await this._findActiveVersion(projectId);
        if (!version) return null;

        const questions = await knex('risk_questions')
            .where({ questionnaire_version_id: version.id, is_active: true })
            .orderBy('sort_order', 'asc')
            .orderBy('id', 'asc');

        const questionIds = questions.map((q) => q.id);
        const options = questionIds.length
            ? await knex('risk_answer_options')
                .whereIn('question_id', questionIds)
                .orderBy('sort_order', 'asc')
                .orderBy('id', 'asc')
            : [];

        const optionsByQuestion = new Map();
        options.forEach((opt) => {
            const arr = optionsByQuestion.get(opt.question_id) || [];
            arr.push(opt);
            optionsByQuestion.set(opt.question_id, arr);
        });

        return { version, questions, optionsByQuestion };
    }

    _findOption(options, rawSubmitted) {
        if (!Array.isArray(options) || options.length === 0) return null;
        const submitted = String(rawSubmitted).trim().toLowerCase();
        if (!submitted) return null;

        return options.find((opt) => {
            if (String(opt.code).toLowerCase() === submitted) return true;
            if (String(opt.id) === submitted) return true;
            if (String(opt.sort_order) === submitted) return true;
            if (String(opt.score) === submitted) return true;
            return false;
        }) || null;
    }
}

module.exports = new RiskQuestionnaireService();
