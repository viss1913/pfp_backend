const https = require('https');

const BASE_URL = 'pfpbackend-production.up.railway.app';
const adminCredentials = {
    email: 'admin@pfp.local',
    password: 'admin123'
};

function makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const postData = data ? JSON.stringify(data) : null;
        
        const options = {
            hostname: BASE_URL,
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        if (postData) {
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: responseData });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

async function main() {
    try {
        console.log('🔍 Проверка classes через API');
        console.log('='.repeat(60));

        const portfolioId = process.argv[2] ? parseInt(process.argv[2]) : 1;

        // Логин
        const loginResponse = await makeRequest('POST', '/api/auth/login', adminCredentials);
        if (loginResponse.status !== 200 || !loginResponse.data.token) {
            throw new Error('Не удалось получить токен');
        }
        const token = loginResponse.data.token;

        // Получаем портфель
        const portfolioResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (portfolioResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const portfolio = portfolioResponse.data;

        console.log(`\n📋 Портфель ID=${portfolioId}: "${portfolio.name}"`);
        console.log('='.repeat(60));
        
        console.log(`\n🔗 Classes (${portfolio.classes?.length || 0} шт.):`);
        if (portfolio.classes && portfolio.classes.length > 0) {
            portfolio.classes.forEach((cls, index) => {
                console.log(`   ${index + 1}. ID: ${cls.id}, Код: ${cls.code}, Название: ${cls.name}`);
            });
        } else {
            console.log('   (нет классов)');
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 SQL запросы для проверки БД:');
        console.log('='.repeat(60));
        
        console.log('\n1️⃣  Проверить связи в таблице portfolio_class_links:');
        console.log(`   SELECT * FROM portfolio_class_links WHERE portfolio_id = ${portfolioId};`);
        
        console.log('\n2️⃣  Проверить с JOIN для получения названий классов:');
        console.log(`   SELECT 
     pcl.id,
     pcl.portfolio_id,
     pcl.class_id,
     pc.code,
     pc.name
   FROM portfolio_class_links pcl
   JOIN portfolio_classes pc ON pcl.class_id = pc.id
   WHERE pcl.portfolio_id = ${portfolioId}
   ORDER BY pcl.class_id;`);

        console.log('\n3️⃣  Проверить JSON поле classes (если используется fallback):');
        console.log(`   SELECT id, name, classes FROM portfolios WHERE id = ${portfolioId};`);

        console.log('\n4️⃣  Ожидаемые class_id для этого портфеля:');
        const expectedIds = portfolio.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        if (expectedIds.length > 0) {
            console.log(`   [${expectedIds.join(', ')}]`);
            console.log(`\n   Проверка: SELECT COUNT(*) as count FROM portfolio_class_links WHERE portfolio_id = ${portfolioId} AND class_id IN (${expectedIds.join(', ')});`);
            console.log(`   Должно вернуть: count = ${expectedIds.length}`);
        } else {
            console.log('   (нет классов)');
            console.log(`\n   Проверка: SELECT COUNT(*) as count FROM portfolio_class_links WHERE portfolio_id = ${portfolioId};`);
            console.log(`   Должно вернуть: count = 0`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Проверка завершена');
        console.log('='.repeat(60));
        console.log('\n💡 Выполните эти SQL запросы в вашей БД, чтобы проверить реальное состояние');

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();







