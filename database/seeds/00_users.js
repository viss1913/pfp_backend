const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
    // Удаляем существующих пользователей
    await knex('users').del();

    // Создаём admin пользователя
    const adminPasswordHash = await bcrypt.hash('admin123', 10);

    await knex('users').insert([
        {
            id: 1,
            agent_id: null, // Админ не привязан к агенту
            email: 'admin@pfp.local',
            password_hash: adminPasswordHash,
            name: 'System Administrator',
            role: 'admin',
            is_active: true
        }
    ]);

    console.log('✅ Admin user created: admin@pfp.local / admin123');
};
