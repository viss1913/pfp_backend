const db = require('./src/config/database');
const adminUserController = require('./src/controllers/adminUserController');

async function createUser() {
    try {
        console.log('--- Creating Second Test User for Anna Dengina ---');
        const req = {
            body: {
                email: "test_anna_2@test.ru",
                password: "password123",
                name: "Анна Деньгина Тест 2",
                projectId: 4,
                role: "admin"
            }
        };
        const res = {
            status: function (s) { this.statusCode = s; return this; },
            json: function (j) {
                console.log(`Status: ${this.statusCode}`);
                console.log('Response:', JSON.stringify(j, null, 2));
            }
        };

        await adminUserController.createUser(req, res);
        console.log('\n--- Done ---');
        process.exit(0);
    } catch (err) {
        console.error('Error creating user:', err);
        process.exit(1);
    }
}

createUser();
