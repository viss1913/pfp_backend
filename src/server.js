require('dotenv').config();
const app = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 3000;
const AUTO_SEED = process.env.AUTO_SEED !== 'false'; // Set to 'false' to disable

// Run migrations, seeds (if needed), and start server
async function startServer() {
    try {
        console.log('Running database migrations...');
        try {
            await db.migrate.latest();
            console.log('✅ Migrations completed successfully');
        } catch (migrationError) {
            console.error('❌ Migration error:', migrationError.message);
            console.error('Stack:', migrationError.stack);
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

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📚 Swagger UI: http://localhost:${PORT}/api-docs`);
            console.log(`🔐 Login: POST /api/auth/login`);
        });
    } catch (err) {
        console.error('❌ Server startup failed:', err);
        process.exit(1);
    }
}

startServer();
