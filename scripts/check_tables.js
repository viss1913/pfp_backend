/**
 * Скрипт для проверки и создания отсутствующих таблиц
 * Запуск: node scripts/check_tables.js
 */

require('dotenv').config();
const db = require('../src/config/database');

async function checkAndCreateTables() {
    try {
        console.log('🔍 Checking database tables...\n');

        const criticalTables = [
            'portfolio_class_links',
            'portfolio_risk_profiles',
            'portfolio_instruments'
        ];

        for (const tableName of criticalTables) {
            const exists = await db.schema.hasTable(tableName);
            if (exists) {
                console.log(`✅ Table '${tableName}' exists`);
            } else {
                console.log(`❌ Table '${tableName}' is MISSING`);
                console.log(`   Attempting to create...`);
                
                try {
                    // Создаём таблицы вручную
                    if (tableName === 'portfolio_class_links') {
                        await db.schema.createTable(tableName, (table) => {
                            table.bigIncrements('id').primary();
                            table.bigInteger('portfolio_id').unsigned().notNullable()
                                .references('id').inTable('portfolios').onDelete('CASCADE');
                            table.integer('class_id').unsigned().notNullable()
                                .references('id').inTable('portfolio_classes').onDelete('CASCADE');
                        });
                        console.log(`   ✅ Created '${tableName}'`);
                    } else if (tableName === 'portfolio_risk_profiles') {
                        await db.schema.createTable(tableName, (table) => {
                            table.bigIncrements('id').primary();
                            table.bigInteger('portfolio_id').unsigned().notNullable()
                                .references('id').inTable('portfolios').onDelete('CASCADE');
                            table.enu('profile_type', ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).notNullable();
                            table.decimal('potential_yield_percent', 5, 2).nullable();
                        });
                        console.log(`   ✅ Created '${tableName}'`);
                    } else if (tableName === 'portfolio_instruments') {
                        await db.schema.createTable(tableName, (table) => {
                            table.bigIncrements('id').primary();
                            table.bigInteger('portfolio_risk_profile_id').unsigned().notNullable()
                                .references('id').inTable('portfolio_risk_profiles').onDelete('CASCADE');
                            table.bigInteger('product_id').unsigned().notNullable()
                                .references('id').inTable('products').onDelete('RESTRICT');
                            table.enu('bucket_type', ['INITIAL_CAPITAL', 'TOP_UP']).nullable();
                            table.decimal('share_percent', 5, 2).notNullable();
                            table.integer('order_index').nullable();
                        });
                        console.log(`   ✅ Created '${tableName}'`);
                    }
                } catch (createError) {
                    console.error(`   ❌ Failed to create '${tableName}':`, createError.message);
                }
            }
        }

        console.log('\n✅ Table check completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkAndCreateTables();














