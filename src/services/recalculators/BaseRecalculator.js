class BaseRecalculator {
    constructor() {
        this.commonFields = ['target_amount', 'term_months', 'initial_capital', 'priority', 'inflation_rate', 'goal_name', 'id', 'client_id', 'goal_type_id'];
    }

    /**
     * Merge existing goal with patch data and handle type conversion
     * @param {Object} existing - Current goal from DB
     * @param {Object} patch - Unverified data from request body
     * @returns {Object} Updated goal object
     */
    prepare(existing, patch) {
        const result = { ...existing, ...patch };

        // Clean up internal non-goal fields if they leaked from root request
        delete result.client;
        delete result.goals;
        delete result.goal_id; // we use 'id' internally or as fallback

        return this.convertNumbers(result);
    }

    /**
     * Convert string numbers to real numbers for specific fields
     */
    convertNumbers(data) {
        const fieldsToConvert = this.getNumericFields();
        fieldsToConvert.forEach(field => {
            if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
                data[field] = Number(data[field]);
            }
        });
        return data;
    }

    /**
     * Fields that should be numeric across all calculators
     */
    getNumericFields() {
        return ['target_amount', 'initial_capital', 'term_months', 'priority', 'inflation_rate', 'goal_type_id'];
    }
}

module.exports = BaseRecalculator;
