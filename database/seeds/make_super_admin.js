const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
  // Укажите данные Super Admin
  const email = 'vissarovav@bank-future.com';
  const newPassword = '1qazXSW@'; // <--- ЗАДАЙТЕ ПАРОЛЬ ЗДЕСЬ

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const user = await knex('users').where('email', email).first();

  if (user) {
    // Если пользователь есть, обновляем его до super_admin
    await knex('users')
      .where('email', email)
      .update({
        role: 'super_admin',
        password_hash: passwordHash,
        project_id: null,
        is_active: true
      });
    console.log(`✅ User ${email} promoted to super_admin and password updated.`);
  } else {
    // Если пользователя нет, создаем нового
    await knex('users').insert({
      email: email,
      password_hash: passwordHash,
      name: 'Main Super Admin',
      role: 'super_admin',
      project_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log(`✅ New super_admin user created: ${email}`);
  }
};
