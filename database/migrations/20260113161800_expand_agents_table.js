/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.string('first_name', 100).nullable();
        table.string('last_name', 100).nullable();
        table.string('middle_name', 100).nullable();
        table.string('phone', 50).nullable();
        table.string('email', 255).nullable();
        table.string('website_url', 255).nullable();
        table.string('region', 100).nullable();
        table.string('city', 100).nullable();
        table.string('timezone', 100).nullable();
        table.text('office_address').nullable();
        table.string('position_title', 255).nullable();
        table.text('specialization').nullable();
        table.decimal('consultation_price', 18, 2).nullable();
        table.string('currency', 10).defaultTo('RUB');
        table.string('target_customer_segment', 255).nullable();
        table.text('about_text').nullable();
        table.integer('experience_years').nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('date_joined').nullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('agents', (table) => {
        table.dropColumns([
            'first_name', 'last_name', 'middle_name', 'phone', 'email',
            'website_url', 'region', 'city', 'timezone', 'office_address',
            'position_title', 'specialization', 'consultation_price', 'currency',
            'target_customer_segment', 'about_text', 'experience_years',
            'is_active', 'date_joined'
        ]);
    });
};
