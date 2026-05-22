require('dotenv').config();
const app = require('./app');
const db = require('./config/database');
const constructorBotService = require('./services/constructorBotService');


const PORT = process.env.PORT || 3000;
const AUTO_SEED = process.env.AUTO_SEED !== 'false'; // Set to 'false' to disable

// Run migrations, seeds (if needed), and start server
async function startServer() {
    try {
        const { getR2StartupDiagnostics } = require('./utils/r2Client');
        const r2 = getR2StartupDiagnostics();
        if (r2.gaps.length) {
            console.warn('[R2] Не хватает переменных:', r2.gaps.join(', '), '— загрузки уйдут на локальный диск (или 503 при STORAGE_REQUIRE_R2)');
            console.warn(
                `[R2] endpoint/S3_URL задан=${r2.hasEndpoint}, R2_ACCOUNT_ID или CLOUDFLARE_ACCOUNT_ID задан=${r2.hasAccountId} — на Railway часто забывают один из них (в .env он есть, в Variables сервиса — нет)`
            );
        } else if (!r2.uploadReady) {
            console.warn(
                `[R2] bucket="${r2.bucket}" но нет публичного префикса (R2_PUBLIC_BASE_URL / R2_CDN_BASE_URL / R2_PUBLIC_DOMAIN) — POST обложки/аватар → 503 R2_PUBLIC_URL_MISSING`
            );
        } else {
            console.log(
                `[R2] готов к загрузкам: bucket="${r2.bucket}" public_base="${r2.publicBase}"` +
                    (r2.storageRequireR2 ? ' (STORAGE_REQUIRE_R2=1 — без R2 диск не используется)' : '')
            );
        }

        console.log('Running database migrations...');
        try {
            const migrations = await db.migrate.latest();
            if (migrations && migrations.length > 0) {
                console.log(`✅ Applied ${migrations.length} migration(s):`, migrations);
            } else {
                console.log('✅ All migrations are up to date');
            }

            // Verify critical tables exist
            const criticalTables = [
                'portfolios',
                'portfolio_class_links',
                'portfolio_risk_profiles',
                'portfolio_instruments',
                'portfolio_classes'
            ];

            console.log('Checking critical tables...');
            const missingTables = [];
            for (const table of criticalTables) {
                const exists = await db.schema.hasTable(table);
                if (exists) {
                    console.log(`  ✅ Table '${table}' exists`);
                } else {
                    console.error(`  ❌ Table '${table}' is MISSING!`);
                    missingTables.push(table);
                }
            }

            // Auto-fix missing tables
            if (missingTables.length > 0) {
                console.log(`\n🔧 Attempting to create ${missingTables.length} missing table(s)...`);
                try {
                    if (missingTables.includes('portfolio_class_links')) {
                        await db.schema.createTable('portfolio_class_links', (table) => {
                            table.bigIncrements('id').primary();
                            table.bigInteger('portfolio_id').unsigned().notNullable()
                                .references('id').inTable('portfolios').onDelete('CASCADE');
                            table.integer('class_id').unsigned().notNullable()
                                .references('id').inTable('portfolio_classes').onDelete('CASCADE');
                        });
                        console.log('  ✅ Created portfolio_class_links');
                    }

                    if (missingTables.includes('portfolio_risk_profiles')) {
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
                        console.log('  ✅ Created portfolio_risk_profiles');
                    }

                    if (missingTables.includes('portfolio_instruments')) {
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
                        console.log('  ✅ Created portfolio_instruments');
                    }

                    console.log('✅ All missing tables created successfully!');
                } catch (createError) {
                    console.error('❌ Failed to create missing tables:', createError.message);
                    console.error('⚠️  Please run migrations manually or fix database schema issues.');
                }
            }
        } catch (migrationError) {
            console.error('❌ Migration error:', migrationError.message);
            console.error('Stack:', migrationError.stack);
            console.error('⚠️  CRITICAL: Migrations failed! Server may not work correctly.');
            console.error('⚠️  Please check the error above and fix database schema issues.');
            // Don't exit - try to continue, but log the error
            console.warn('⚠️  Continuing despite migration error. Some features may not work.');
        }

        // Auto-seed if users table is empty (first run)
        if (AUTO_SEED) {
            const userCount = await db('users').count('* as count').first();

            if (userCount.count === 0) {
                console.log('📦 No users found, running seeds...');
                await db.seed.run();
                console.log('✅ Seeds completed successfully');
                console.log('👤 Admin user created: admin@pfp.local / admin123');
            } else {
                console.log('ℹ️  Users already exist, skipping main seeds');
            }

            // Check if product_types table exists and is empty, then seed it
            try {
                const tableExists = await db.schema.hasTable('product_types');
                if (tableExists) {
                    const productTypeCount = await db('product_types').count('* as count').first();
                    if (parseInt(productTypeCount.count) === 0) {
                        console.log('📦 No product types found, running product types seed...');
                        // Run product types seed directly
                        const productTypesSeed = require('../database/seeds/02_product_types');
                        await productTypesSeed.seed(db);
                        console.log('✅ Product types seed completed successfully');
                    }
                }
            } catch (seedError) {
                console.warn('⚠️  Could not seed product types:', seedError.message);
                // Don't fail server startup if seed fails
            }
        }

        console.log('Testing database connection...');
        await db.raw('SELECT 1');
        console.log('✅ Database connected successfully');

        // Initialize AI Constructor Bots
        await constructorBotService.initAllBots();

        // Initialize Macro Data Scheduler
        const macroScheduler = require('./services/macroScheduler');
        macroScheduler.initScheduler();

        const { scheduleStaleInflationSyncOnStartup } = require('./services/macroStartupSync');
        scheduleStaleInflationSyncOnStartup();

        const newsScheduler = require('./services/newsScheduler');
        newsScheduler.initScheduler();

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📚 Swagger UI: http://localhost:${PORT}/api-docs`);
            console.log(`🔐 Login: POST /api/auth/login`);
        });
    } catch (err) {
        console.error('❌ Server startup issue:', err.message);
        console.warn('⚠️  Attempting to start app anyway... (Database might be unavailable)');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT} (RECOVERY MODE)`);
        });
    }
}

startServer();
