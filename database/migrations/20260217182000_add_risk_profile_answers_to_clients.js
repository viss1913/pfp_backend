
exports.up = function (knex) {
    return knex.schema.table('clients', table => {
        table.json('risk_profile_answers').nullable().comment('Answers to Dengina risk profile questionnaire (Q2-Q10)');
    });
};

exports.down = function (knex) {
    return knex.schema.table('clients', table => {
        table.dropColumn('risk_profile_answers');
    });
};
