const db = require('./src/config/database');
const adminUserController = require('./src/controllers/adminUserController');

async function debug() {
    try {
        console.log('--- Existing Projects ---');
        const projects = await db('projects').select('id', 'name');
        console.log(JSON.stringify(projects, null, 2));

        console.log('\n--- Testing User Creation ---');
        const req = {
            body: {
                email: "test_auto@test.ru",
                password: "123456",
                name: "Анна Деньгина тест auto",
                projectId: 4,
                role: "admin"
            }
        };
        const res = {
            status: function (s) { this.statusCode = s; return this; },
            json: function (j) { console.log(`Status: ${this.statusCode}, Response:`, JSON.stringify(j, null, 2)); }
        };

        await adminUserController.createUser(req, res);
        process.exit(0);
    } catch (err) {
        console.error('Debug script error:', err);
        process.exit(1);
    }
}

debug();
