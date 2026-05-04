/**
 * Расширяет profile_type портфеля до 5 уровней (как risk_profile_extended в анкете).
 * Старые значения CONSERVATIVE | BALANCED | AGGRESSIVE остаются валидными.
 */
const FIVE_LEVEL_ENUM = [
    'CONSERVATIVE',
    'MODERATELY_CONSERVATIVE',
    'BALANCED',
    'MODERATELY_AGGRESSIVE',
    'AGGRESSIVE'
].join("','");

exports.up = async function (knex) {
    const hasTable = await knex.schema.hasTable('portfolio_risk_profiles');
    if (!hasTable) return;

    const [rows] = await knex.raw(`
        SELECT COLUMN_TYPE AS ct FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'portfolio_risk_profiles'
          AND COLUMN_NAME = 'profile_type'
    `);
    const ct = String(rows?.[0]?.ct || '');
    if (ct.includes('MODERATELY_CONSERVATIVE')) return;

    await knex.raw(`
        ALTER TABLE portfolio_risk_profiles
        MODIFY COLUMN profile_type ENUM('${FIVE_LEVEL_ENUM}') NOT NULL
    `);
};

exports.down = async function (knex) {
    const hasTable = await knex.schema.hasTable('portfolio_risk_profiles');
    if (!hasTable) return;

    const extended = await knex('portfolio_risk_profiles')
        .whereIn('profile_type', ['MODERATELY_CONSERVATIVE', 'MODERATELY_AGGRESSIVE'])
        .first();
    if (extended) {
        throw new Error('Cannot shrink profile_type ENUM: rows use MODERATELY_* values');
    }

    await knex.raw(`
        ALTER TABLE portfolio_risk_profiles
        MODIFY COLUMN profile_type ENUM('CONSERVATIVE','BALANCED','AGGRESSIVE') NOT NULL
    `);
};
