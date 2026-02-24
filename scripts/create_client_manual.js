const db = require('../src/config/database');
const bcrypt = require('bcryptjs');

async function createClientManual() {
    try {
        console.log('--- Manually Creating Client: test6@test.ru ---');

        const email = 'test6@test.ru';
        const password = '567890';
        const projectId = 4;
        const name = 'Тестовый Клиент 6';

        // 1. Check if user already exists
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            console.log(`User ${email} already exists with ID: ${existingUser.id}`);
            process.exit(0);
        }

        const passwordHash = await bcrypt.hash(password, 10);

        // 2. Start transaction
        await db.transaction(async (trx) => {
            // Insert into users
            const [userId] = await trx('users').insert({
                project_id: projectId,
                email: email,
                password_hash: passwordHash,
                name: name,
                role: 'client',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });

            console.log(`User created with ID: ${userId}`);

            // Insert into clients
            const [clientId] = await trx('clients').insert({
                user_id: userId,
                project_id: projectId,
                first_name: 'Тестовый',
                last_name: 'Клиент 6',
                email: email,
                created_at: new Date(),
                updated_at: new Date(),
                crm_status: 'THINKING',
                crm_status_date: new Date()
            });

            console.log(`Client record created with ID: ${clientId}`);
        });

        console.log('\n✅ Successfully created test user and client record.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating client manually:', err);
        process.exit(1);
    }
}

createClientManual();
