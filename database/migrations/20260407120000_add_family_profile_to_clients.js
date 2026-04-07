exports.up = function (knex) {
    return knex.schema.table('clients', table => {
        table.json('family_profile').nullable().comment('Family office reference profile (non-calculation metadata)');
    });
};

exports.down = function (knex) {
    return knex.schema.table('clients', table => {
        table.dropColumn('family_profile');
    });
};
