const riskQuestionnaireService = require('./riskQuestionnaireService');

class RiskProfileService {
    _legacyScoreTermMonths(termMonths) {
        if (!termMonths || termMonths <= 24) return 1;
        if (termMonths <= 60) return 2;
        if (termMonths <= 120) return 3;
        if (termMonths <= 240) return 4;
        return 5;
    }

    _legacyProfileByPoints(points) {
        if (points <= 20) return 'CONSERVATIVE';
        if (points <= 34) return 'BALANCED';
        return 'AGGRESSIVE';
    }

    _calculateLegacyProfile(answers, termMonths) {
        const q1Points = this._legacyScoreTermMonths(termMonths);
        let totalPoints = q1Points;
        for (let i = 2; i <= 10; i += 1) {
            const val = answers[`q${i}`];
            if (val !== undefined && val !== null && val !== '') {
                totalPoints += Number(val);
            }
        }
        return {
            risk_profile: this._legacyProfileByPoints(totalPoints),
            risk_profile_extended: null,
            questionnaire_version_id: null,
            questionnaire_version_code: 'legacy-q2-q10',
            base_score: null,
            behavior_score: null,
            behavior_coefficient: null,
            final_score: null,
            max_final_score_by_capacity: null,
            answers,
            explanation: {
                legacy_total_points: totalPoints
            }
        };
    }

    _scoreTermMonths(termMonths) {
        const months = Number(termMonths || 0);
        if (months <= 12) return 1;
        if (months <= 36) return 2;
        if (months <= 84) return 3;
        if (months <= 180) return 4;
        return 5;
    }

    _scoreDebtLoad(client = {}) {
        const liabilities = Array.isArray(client.liabilities) ? client.liabilities : [];
        const monthlyDebt = liabilities.reduce((sum, item) => sum + Number(item.monthly_payment || 0), 0);
        const income = Number(client.avg_monthly_income || 0);
        if (income <= 0) return 2;
        const ratio = monthlyDebt / income;
        if (ratio > 0.5) return 1;
        if (ratio > 0.35) return 2;
        if (ratio > 0.2) return 3;
        if (ratio > 0) return 4;
        return 5;
    }

    _scoreFreeCashFlow(client = {}) {
        const income = Number(client.avg_monthly_income || 0);
        if (income <= 0) return 2;
        const liabilities = Array.isArray(client.liabilities) ? client.liabilities : [];
        const expenses = Array.isArray(client.expenses) ? client.expenses : [];
        const monthlyDebt = liabilities.reduce((sum, item) => sum + Number(item.monthly_payment || 0), 0);
        const monthlyExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const freeCashFlowRatio = (income - monthlyDebt - monthlyExpenses) / income;
        if (freeCashFlowRatio < 0.05) return 1;
        if (freeCashFlowRatio < 0.1) return 2;
        if (freeCashFlowRatio < 0.2) return 3;
        if (freeCashFlowRatio < 0.3) return 4;
        return 5;
    }

    _scoreReserveFund(client = {}) {
        const liquid = Number(client.total_liquid_capital || 0);
        const liabilities = Array.isArray(client.liabilities) ? client.liabilities : [];
        const expenses = Array.isArray(client.expenses) ? client.expenses : [];
        const monthlyDebt = liabilities.reduce((sum, item) => sum + Number(item.monthly_payment || 0), 0);
        const monthlyExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const burn = monthlyDebt + monthlyExpenses;
        if (burn <= 0) return liquid > 0 ? 5 : 3;
        const months = liquid / burn;
        if (months < 1) return 1;
        if (months < 3) return 2;
        if (months < 5) return 3;
        if (months < 7) return 4;
        return 5;
    }

    _scoreHomeOwnership(client = {}) {
        const fp = client.family_profile && typeof client.family_profile === 'object' ? client.family_profile : {};
        const realEstate = Array.isArray(fp.real_estate) ? fp.real_estate : [];
        if (realEstate.length === 0) return 1;
        const hasOwned = realEstate.some((item) => String(item.status || '').toLowerCase() === 'owned');
        if (hasOwned) return 5;
        return 3;
    }

    _scoreDependents(client = {}) {
        const fp = client.family_profile && typeof client.family_profile === 'object' ? client.family_profile : {};
        const children = Array.isArray(fp.children) ? fp.children.length : 0;
        if (children >= 3) return 1;
        if (children === 2) return 2;
        if (children === 1) return 3;
        return 5;
    }

    _deriveCapacityCaps(componentScores) {
        let maxFinalScore = 5;
        if (componentScores.term <= 2) maxFinalScore = Math.min(maxFinalScore, 2.6);
        if (componentScores.debt <= 2) maxFinalScore = Math.min(maxFinalScore, 2.6);
        if (componentScores.reserve <= 2) maxFinalScore = Math.min(maxFinalScore, 2.6);
        if (componentScores.dependents === 1) maxFinalScore = Math.min(maxFinalScore, 3.4);
        return maxFinalScore;
    }

    _toBehaviorCoefficient(behaviorAverage) {
        const coeff = 1.25 - 0.2 * (behaviorAverage - 1);
        return Number(Math.max(0.65, Math.min(1.25, coeff)).toFixed(3));
    }

    _finalScoreToLabels(score) {
        if (score <= 1.8) return { profile5: 'CONSERVATIVE', profile3: 'CONSERVATIVE' };
        if (score <= 2.6) return { profile5: 'MODERATELY_CONSERVATIVE', profile3: 'CONSERVATIVE' };
        if (score <= 3.4) return { profile5: 'BALANCED', profile3: 'BALANCED' };
        if (score <= 4.2) return { profile5: 'MODERATELY_AGGRESSIVE', profile3: 'BALANCED' };
        return { profile5: 'AGGRESSIVE', profile3: 'AGGRESSIVE' };
    }

    async calculateGoalProfile({ answers, goal, client, projectId }) {
        if (!goal || !client) return null;

        const questionnaire = await riskQuestionnaireService.getActiveQuestionnaire(projectId || client.project_id || null);
        if (!questionnaire) {
            return this._calculateLegacyProfile(answers, goal.term_months || 0);
        }

        const normalizedAnswers = riskQuestionnaireService.normalizeAnswerMap(answers, questionnaire);
        const behavior = riskQuestionnaireService.computeBehaviorScore(normalizedAnswers, questionnaire);
        if (!behavior) return null;

        const weights = {
            term: 0.30,
            debt: 0.20,
            freeCashFlow: 0.15,
            reserve: 0.15,
            housing: 0.10,
            dependents: 0.05,
            incomeStability: 0.05
        };

        const componentScores = {
            term: this._scoreTermMonths(goal.term_months),
            debt: this._scoreDebtLoad(client),
            freeCashFlow: this._scoreFreeCashFlow(client),
            reserve: this._scoreReserveFund(client),
            housing: this._scoreHomeOwnership(client),
            dependents: this._scoreDependents(client),
            incomeStability: riskQuestionnaireService.getIncomeStabilityScore(client)
        };

        const baseScoreRaw = Object.keys(weights).reduce(
            (sum, key) => sum + componentScores[key] * weights[key],
            0
        );
        const baseScore = Number(baseScoreRaw.toFixed(3));

        const behaviorCoefficient = this._toBehaviorCoefficient(behavior.average_score);
        let finalScore = Number((baseScore * behaviorCoefficient).toFixed(3));
        const maxByCapacity = this._deriveCapacityCaps(componentScores);
        finalScore = Number(Math.min(finalScore, maxByCapacity).toFixed(3));

        const labels = this._finalScoreToLabels(finalScore);

        return {
            risk_profile: labels.profile3,
            risk_profile_extended: labels.profile5,
            questionnaire_version_id: questionnaire.id,
            questionnaire_version_code: questionnaire.code,
            base_score: baseScore,
            behavior_score: behavior.average_score,
            behavior_coefficient: behaviorCoefficient,
            final_score: finalScore,
            max_final_score_by_capacity: maxByCapacity,
            answers: normalizedAnswers,
            explanation: {
                weights,
                capacity_components: componentScores,
                behavior_details: behavior.details
            }
        };
    }
}

module.exports = new RiskProfileService();
