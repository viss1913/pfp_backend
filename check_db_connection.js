require('dotenv').config();
const knexfile = require('./knexfile');

console.log('🔍 Проверка подключения к БД');
console.log('='.repeat(60));

// Проверяем переменные окружения
console.log('\n📋 Переменные окружения:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'не установлено'}`);
console.log(`   MYSQL_URL: ${process.env.MYSQL_URL ? 'установлено (скрыто)' : 'не установлено'}`);
console.log(`   MYSQLHOST: ${process.env.MYSQLHOST || 'не установлено'}`);
console.log(`   MYSQLUSER: ${process.env.MYSQLUSER || 'не установлено'}`);
console.log(`   MYSQLDATABASE: ${process.env.MYSQLDATABASE || 'не установлено'}`);
console.log(`   DB_HOST: ${process.env.DB_HOST || 'не установлено'}`);
console.log(`   DB_USER: ${process.env.DB_USER || 'не установлено'}`);
console.log(`   DB_NAME: ${process.env.DB_NAME || 'не установлено'}`);

// Получаем конфигурацию подключения
const env = process.env.NODE_ENV || 'development';
const config = knexfile[env];

console.log('\n📊 Конфигурация подключения:');
console.log(`   Окружение: ${env}`);
console.log(`   Host: ${config.connection.host}`);
console.log(`   Port: ${config.connection.port}`);
console.log(`   User: ${config.connection.user}`);
console.log(`   Database: ${config.connection.database}`);
console.log(`   Password: ${config.connection.password ? '***установлен***' : 'не установлен'}`);

// Определяем тип подключения
let connectionType = 'неизвестно';
if (process.env.MYSQL_URL) {
    connectionType = 'Railway (MYSQL_URL)';
} else if (process.env.MYSQLHOST) {
    connectionType = 'Railway (MYSQLHOST/MYSQLUSER/etc)';
} else if (process.env.DB_HOST) {
    connectionType = 'Локальная разработка (DB_*)';
} else {
    connectionType = 'По умолчанию (localhost)';
}

console.log(`\n🔗 Тип подключения: ${connectionType}`);

console.log('\n' + '='.repeat(60));
console.log('💡 Важно:');
console.log('='.repeat(60));
console.log('1. Мои тесты отправляют HTTP запросы на production сервер:');
console.log('   https://pfpbackend-production.up.railway.app');
console.log('\n2. Production сервер использует Railway MySQL БД');
console.log('\n3. Я НЕ подключаюсь напрямую к БД из тестов');
console.log('   Тесты работают через API (HTTP запросы)');
console.log('\n4. Чтобы проверить БД напрямую, нужно:');
console.log('   - Подключиться к Railway MySQL');
console.log('   - Или использовать Railway Dashboard (как на вашем скриншоте)');

console.log('\n' + '='.repeat(60));








