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
        console.log('🧪 Тест: Установка classes и проверка БД');
        console.log('='.repeat(60));

        const portfolioId = 1;

        // Логин
        console.log('\n📝 ШАГ 1: Логин');
        const loginResponse = await makeRequest('POST', '/api/auth/login', adminCredentials);
        if (loginResponse.status !== 200 || !loginResponse.data.token) {
            throw new Error('Не удалось получить токен');
        }
        const token = loginResponse.data.token;
        console.log('✅ Токен получен');

        // Получаем текущий портфель
        console.log('\n📝 ШАГ 2: Получение текущего портфеля');
        const beforeResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (beforeResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const beforePortfolio = beforeResponse.data;
        const beforeClassIds = beforePortfolio.classes?.map(c => c.id) || [];
        console.log(`✅ Портфель: "${beforePortfolio.name}"`);
        console.log(`   Classes ДО: [${beforeClassIds.join(', ') || 'нет'}]`);

        // Подготавливаем данные для обновления с classes как массив объектов
        console.log('\n📝 ШАГ 3: Подготовка данных для обновления');
        const updateData = {
            name: beforePortfolio.name,
            currency: beforePortfolio.currency,
            amount_from: parseFloat(beforePortfolio.amount_from),
            amount_to: parseFloat(beforePortfolio.amount_to),
            term_from_months: beforePortfolio.term_from_months,
            term_to_months: beforePortfolio.term_to_months,
            age_from: beforePortfolio.age_from,
            age_to: beforePortfolio.age_to,
            investor_type: beforePortfolio.investor_type,
            gender: beforePortfolio.gender,
            // Отправляем classes как массив объектов (как делает фронтенд)
            classes: [
                { id: 2, code: "PASSIVE_INCOME", name: "Пассивный доход" },
                { id: 3, code: "INVESTMENT", name: "Инвестиции" },
                { id: 4, code: "OTHER", name: "Прочее" }
            ],
            riskProfiles: beforePortfolio.riskProfiles.map(rp => ({
                profile_type: rp.profile_type,
                instruments: (rp.instruments || []).map(inst => ({
                    product_id: typeof inst.product_id === 'string' ? parseInt(inst.product_id) : inst.product_id,
                    bucket_type: inst.bucket_type,
                    share_percent: typeof inst.share_percent === 'string' ? parseFloat(inst.share_percent) : inst.share_percent,
                    order_index: inst.order_index || null
                }))
            }))
        };

        console.log(`\n📤 Отправляем PUT запрос с classes: [2, 3, 4] (как объекты)`);

        // Обновляем портфель
        console.log('\n📝 ШАГ 4: Отправка PUT запроса');
        const updateResponse = await makeRequest('PUT', `/api/pfp/portfolios/${portfolioId}`, updateData, token);
        
        if (updateResponse.status !== 200) {
            throw new Error(`Ошибка обновления: ${updateResponse.status} - ${JSON.stringify(updateResponse.data)}`);
        }
        console.log('✅ Портфель обновлен');

        // Ждем немного
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Проверяем результат
        console.log('\n📝 ШАГ 5: Проверка результата через GET');
        const afterResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (afterResponse.status !== 200) {
            throw new Error('Не удалось получить обновленный портфель');
        }
        const afterPortfolio = afterResponse.data;
        const afterClassIds = afterPortfolio.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        
        console.log(`✅ Портфель получен: "${afterPortfolio.name}"`);
        console.log(`   Classes ПОСЛЕ: [${afterClassIds.join(', ') || 'нет'}]`);
        
        if (afterClassIds.length > 0) {
            console.log(`\n   Детали:`);
            afterPortfolio.classes.forEach(cls => {
                console.log(`     - ID: ${cls.id}, Код: ${cls.code}, Название: ${cls.name}`);
            });
        }

        // Выводим SQL запросы для проверки БД
        console.log('\n' + '='.repeat(60));
        console.log('📊 SQL ЗАПРОСЫ ДЛЯ ПРОВЕРКИ БД:');
        console.log('='.repeat(60));
        
        console.log('\n1️⃣  Проверить все связи для портфеля:');
        console.log(`   SELECT * FROM portfolio_class_links WHERE portfolio_id = ${portfolioId};`);
        
        console.log('\n2️⃣  Проверить с названиями классов:');
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

        console.log('\n3️⃣  Ожидаемый результат:');
        if (afterClassIds.length > 0) {
            console.log(`   Должно быть ${afterClassIds.length} записей с class_id: ${afterClassIds.join(', ')}`);
            console.log(`\n   Проверка количества:`);
            console.log(`   SELECT COUNT(*) as count FROM portfolio_class_links WHERE portfolio_id = ${portfolioId} AND class_id IN (${afterClassIds.join(', ')});`);
            console.log(`   Ожидается: count = ${afterClassIds.length}`);
        } else {
            console.log(`   Должно быть 0 записей (все classes удалены)`);
            console.log(`\n   Проверка:`);
            console.log(`   SELECT COUNT(*) as count FROM portfolio_class_links WHERE portfolio_id = ${portfolioId};`);
            console.log(`   Ожидается: count = 0`);
        }

        console.log('\n4️⃣  Если таблица portfolio_class_links не существует, проверьте JSON поле:');
        console.log(`   SELECT id, name, classes FROM portfolios WHERE id = ${portfolioId};`);

        // Сравнение
        console.log('\n' + '='.repeat(60));
        console.log('📊 СРАВНЕНИЕ:');
        console.log('='.repeat(60));
        console.log(`ДО:  [${beforeClassIds.join(', ') || 'нет'}]`);
        console.log(`ПОСЛЕ: [${afterClassIds.join(', ') || 'нет'}]`);
        
        const expected = [2, 3, 4];
        if (JSON.stringify(afterClassIds) === JSON.stringify(expected)) {
            console.log('\n✅ УСПЕХ! Classes установлены правильно!');
            console.log('   Теперь выполните SQL запросы выше, чтобы проверить БД');
        } else {
            console.log('\n⚠️  Classes не соответствуют ожидаемым');
            console.log(`   Ожидалось: [${expected.join(', ')}]`);
            console.log(`   Получено: [${afterClassIds.join(', ')}]`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ ТЕСТ ЗАВЕРШЕН');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();










