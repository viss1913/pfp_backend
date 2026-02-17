/**
 * Risk Profile Service (Anna Dengina Methodology)
 * 
 * Automatically calculates risk profile based on questionnaire answers (Q2-Q10)
 * and goal investment horizon (Q1).
 */
class RiskProfileService {
    /**
     * Map goal term in months to Q1 points
     */
    calculatePointsForHorizon(termMonths) {
        if (!termMonths || termMonths <= 24) return 1; // 1-2 years
        if (termMonths <= 60) return 2;  // 3-5 years
        if (termMonths <= 120) return 3; // 6-10 years
        if (termMonths <= 240) return 4; // 11-20 years
        return 5; // > 20 years
    }

    /**
     * Get profile string based on total points
     */
    getProfileByPoints(points) {
        if (points <= 20) return 'CONSERVATIVE';
        if (points <= 34) return 'BALANCED';
        return 'AGGRESSIVE';
    }

    /**
     * Calculate profile for a specific goal
     * @param {Object} answers - Object with questions q2-q10 and their point values
     * @param {number} termMonths - Goal term in months
     * @returns {string} - CONSERVATIVE, BALANCED, or AGGRESSIVE
     */
    calculateGoalProfile(answers, termMonths) {
        if (!answers || typeof answers !== 'object') {
            return null; // Fallback to user-provided profile if any
        }

        const q1Points = this.calculatePointsForHorizon(termMonths);

        // Sum weights from q2 to q10
        let totalPoints = q1Points;
        for (let i = 2; i <= 10; i++) {
            const val = answers[`q${i}`];
            if (val !== undefined && val !== null) {
                totalPoints += Number(val);
            }
        }

        return this.getProfileByPoints(totalPoints);
    }
}

module.exports = new RiskProfileService();
