require('dotenv').config();
const app = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 3000;

// Run migrations and start server
async function startServer() {
    try {
        console.log('Running database migrations...');
        await db.migrate.latest();
        console.log('✅ Migrations completed successfully');

        console.log('Testing database connection...');
        await db.raw('SELECT 1');
        console.log('✅ Database connected successfully');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📚 Swagger UI available at http://localhost:${PORT}/api-docs`);
        });
    } catch (err) {
        console.error('❌ Server startup failed:', err);
        process.exit(1);
    }
}

startServer();
