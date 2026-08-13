'use strict';

const test = require('node:test');
const assert = require('node:assert');
const riskQuestionnaireService = require('../src/services/riskQuestionnaireService');

function buildQuestionnaire() {
    const mkOptions = () => ([
        { code: 'a1', label: 'opt1', score: 1, sort_order: 1 },
        { code: 'a2', label: 'opt2', score: 2, sort_order: 2 },
        { code: 'a3', label: 'opt3', score: 3, sort_order: 3 },
        { code: 'a4', label: 'opt4', score: 4, sort_order: 4 }
    ]);

    return {
        id: 1,
        code: 'finam-risk-v1',
        questions: [
            { code: 'drawdown_reaction', sort_order: 1, options: mkOptions() },
            { code: 'uncertainty_attitude', sort_order: 2, options: mkOptions() },
            { code: 'investment_success_benchmark', sort_order: 3, options: mkOptions() },
            { code: 'social_comparison_reaction', sort_order: 4, options: mkOptions() },
            { code: 'management_involvement', sort_order: 5, options: mkOptions() },
            { code: 'calmness_tradeoff', sort_order: 6, options: mkOptions() },
            { code: 'post_loss_behavior', sort_order: 7, options: mkOptions() },
            { code: 'investment_experience', sort_order: 8, options: mkOptions() }
        ]
    };
}

function baseAnswers(experienceCode) {
    return {
        drawdown_reaction: 'a2',
        uncertainty_attitude: 'a2',
        investment_success_benchmark: 'a2',
        social_comparison_reaction: 'a2',
        management_involvement: 'a2',
        calmness_tradeoff: 'a2',
        post_loss_behavior: 'a2',
        investment_experience: experienceCode
    };
}

test('investment_experience a4 raises BehaviorScore vs a1', () => {
    const questionnaire = buildQuestionnaire();
    const advanced = riskQuestionnaireService.computeBehaviorScore(
        riskQuestionnaireService.normalizeAnswerMap(baseAnswers('a1'), questionnaire),
        questionnaire
    );
    const none = riskQuestionnaireService.computeBehaviorScore(
        riskQuestionnaireService.normalizeAnswerMap(baseAnswers('a4'), questionnaire),
        questionnaire
    );

    assert.ok(advanced);
    assert.ok(none);
    assert.strictEqual(advanced.questions_answered, 8);
    assert.strictEqual(none.questions_answered, 8);
    assert.ok(none.average_score > advanced.average_score);
    assert.strictEqual(advanced.average_score, 1.875); // (7*2 + 1) / 8
    assert.strictEqual(none.average_score, 2.25); // (7*2 + 4) / 8
});

test('normalizeAnswerMap accepts investment_experience option code', () => {
    const questionnaire = buildQuestionnaire();
    const normalized = riskQuestionnaireService.normalizeAnswerMap(
        { investment_experience: 'a3' },
        questionnaire
    );
    assert.deepStrictEqual(normalized, { investment_experience: 'a3' });
});

test('answers without investment_experience still average remaining questions', () => {
    const questionnaire = buildQuestionnaire();
    const answers = baseAnswers('a2');
    delete answers.investment_experience;
    const score = riskQuestionnaireService.computeBehaviorScore(
        riskQuestionnaireService.normalizeAnswerMap(answers, questionnaire),
        questionnaire
    );
    assert.strictEqual(score.questions_answered, 7);
    assert.strictEqual(score.average_score, 2);
});
