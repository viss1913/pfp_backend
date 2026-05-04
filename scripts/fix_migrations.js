/**
 * Скрипт для исправления проблемы с миграциями
 * Создаёт отсутствующие таблицы вручную
 * Запуск: node scripts/fix_migrations.js
 */

require('dotenv').config();
const db = require('../src/config/database');

async function fixMigrations() {
    try {
        console.log('🔧 Fixing missing database tables...\n');

        // Проверяем и создаём portfolio_class_links
        const classLinksExists = await db.schema.hasTable('portfolio_class_links');
        if (!classLinksExists) {
            console.log('Creating portfolio_class_links...');
            await db.schema.createTable('portfolio_class_links', (table) => {
                table.bigIncrements('id').primary();
                table.bigInteger('portfolio_id').unsigned().notNullable()
                    .references('id').inTable('portfolios').onDelete('CASCADE');
                table.integer('class_id').unsigned().notNullable()
                    .references('id').inTable('portfolio_classes').onDelete('CASCADE');
            });
            console.log('✅ Created portfolio_class_links');
        } else {
            console.log('✅ portfolio_class_links already exists');
        }

        // Проверяем и создаём portfolio_risk_profiles
        const riskProfilesExists = await db.schema.hasTable('portfolio_risk_profiles');
        if (!riskProfilesExists) {
            console.log('Creating portfolio_risk_profiles...');
            await db.schema.createTable('portfolio_risk_profiles', (table) => {
                table.bigIncrements('id').primary();
                table.bigInteger('portfolio_id').unsigned().notNullable()
                    .references('id').inTable('portfolios').onDelete('CASCADE');
                table.enu('profile_type', [
                    'CONSERVATIVE',
                    'MODERATELY_CONSERVATIVE',
                    'BALANCED',
                    'MODERATELY_AGGRESSIVE',
                    'AGGRESSIVE'
                ]).notNullable();
                table.decimal('potential_yield_percent', 5, 2).nullable();
            });
            console.log('✅ Created portfolio_risk_profiles');
        } else {
            console.log('✅ portfolio_risk_profiles already exists');
        }

        // Проверяем и создаём portfolio_instruments
        const instrumentsExists = await db.schema.hasTable('portfolio_instruments');
        if (!instrumentsExists) {
            console.log('Creating portfolio_instruments...');
            await db.schema.createTable('portfolio_instruments', (table) => {
                table.bigIncrements('id').primary();
                table.bigInteger('portfolio_risk_profile_id').unsigned().notNullable()
                    .references('id').inTable('portfolio_risk_profiles').onDelete('CASCADE');
                table.bigInteger('product_id').unsigned().notNullable()
                    .references('id').inTable('products').onDelete('RESTRICT');
                table.enu('bucket_type', ['INITIAL_CAPITAL', 'TOP_UP']).nullable();
                table.decimal('share_percent', 5, 2).notNullable();
                table.integer('order_index').nullable();
            });
            console.log('✅ Created portfolio_instruments');
        } else {
            console.log('✅ portfolio_instruments already exists');
        }

        console.log('\n✅ All tables fixed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

fixMigrations();















