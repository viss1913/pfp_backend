const https = require('https');

const BASE_URL = 'pfpbackend-production.up.railway.app';
const adminCredentials = {
    email: 'admin@pfp.local',
    password: 'admin123'
};

// Вспомогательная функция для HTTP запросов
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
        console.log('🚀 Детальный тест обновления classes');
        console.log('='.repeat(60));

        const portfolioId = 1;

        // Шаг 1: Логин
        console.log('\n📝 ШАГ 1: Логин');
        const loginResponse = await makeRequest('POST', '/api/auth/login', adminCredentials);
        if (loginResponse.status !== 200 || !loginResponse.data.token) {
            throw new Error('Не удалось получить токен');
        }
        const token = loginResponse.data.token;
        console.log('✅ Токен получен');

        // Шаг 2: Получить текущий портфель ДО обновления
        console.log('\n📝 ШАГ 2: Получение текущего портфеля (ДО)');
        const beforeResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (beforeResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const beforePortfolio = beforeResponse.data;
        const beforeClassIds = beforePortfolio.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        console.log(`✅ Портфель получен: "${beforePortfolio.name}"`);
        console.log(`   Classes ДО: [${beforeClassIds.join(', ')}]`);
        console.log(`   Classes детально:`, JSON.stringify(beforePortfolio.classes, null, 2));

        // Шаг 3: Подготавливаем данные для обновления
        console.log('\n📝 ШАГ 3: Подготовка данных для обновления');
        
        // Тест 1: Отправляем classes как массив объектов (как делает фронтенд)
        const updateDataWithObjects = {
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
            // КЛЮЧЕВОЙ МОМЕНТ: отправляем classes как массив объектов
            classes: [
                {
                    id: 2,
                    code: "PASSIVE_INCOME",
                    name: "Пассивный доход"
                },
                {
                    id: 3,
                    code: "INVESTMENT",
                    name: "Инвестиции"
                },
                {
                    id: 4,
                    code: "OTHER",
                    name: "Прочее"
                }
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

        console.log('\n📤 Отправляем PUT запрос с classes как массив объектов:');
        console.log(JSON.stringify(updateDataWithObjects.classes, null, 2));

        // Шаг 4: Обновляем портфель
        console.log('\n📝 ШАГ 4: Отправка PUT запроса');
        const updateResponse = await makeRequest('PUT', `/api/pfp/portfolios/${portfolioId}`, updateDataWithObjects, token);
        
        if (updateResponse.status !== 200) {
            throw new Error(`Ошибка обновления: ${updateResponse.status} - ${JSON.stringify(updateResponse.data)}`);
        }
        console.log('✅ Портфель обновлен');
        
        const updatedClassIds = updateResponse.data.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        console.log(`   Classes в ответе PUT: [${updatedClassIds.join(', ')}]`);

        // Шаг 5: Проверяем результат через GET
        console.log('\n📝 ШАГ 5: Проверка через GET запрос');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Небольшая задержка
        
        const afterResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (afterResponse.status !== 200) {
            throw new Error('Не удалось получить обновленный портфель');
        }
        const afterPortfolio = afterResponse.data;
        const afterClassIds = afterPortfolio.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        
        console.log(`✅ Портфель получен: "${afterPortfolio.name}"`);
        console.log(`   Classes ПОСЛЕ: [${afterClassIds.join(', ')}]`);
        console.log(`   Classes детально:`, JSON.stringify(afterPortfolio.classes, null, 2));

        // Шаг 6: Сравнение
        console.log(`\n${'='.repeat(60)}`);
        console.log('📊 СРАВНЕНИЕ');
        console.log('='.repeat(60));
        console.log(`ДО обновления:  [${beforeClassIds.join(', ')}]`);
        console.log(`ПОСЛЕ обновления: [${afterClassIds.join(', ')}]`);
        
        const expectedClassIds = [2, 3, 4];
        const expectedStr = JSON.stringify(expectedClassIds);
        const actualStr = JSON.stringify(afterClassIds);
        
        console.log(`\nОжидалось: [${expectedClassIds.join(', ')}]`);
        console.log(`Получено:   [${afterClassIds.join(', ')}]`);
        
        if (actualStr === expectedStr) {
            console.log('\n✅ УСПЕХ! Classes обновлены правильно!');
        } else {
            console.log('\n❌ ОШИБКА! Classes не соответствуют ожидаемым!');
            console.log(`   Разница: ожидалось ${expectedClassIds.length} классов, получено ${afterClassIds.length}`);
        }

        // Шаг 7: Тест с пустым массивом
        console.log(`\n${'='.repeat(60)}`);
        console.log('📝 ШАГ 7: Тест с пустым массивом classes');
        console.log('='.repeat(60));
        
        const updateDataEmpty = {
            ...updateDataWithObjects,
            classes: [] // Пустой массив
        };
        
        console.log('\n📤 Отправляем PUT запрос с classes: []');
        const updateEmptyResponse = await makeRequest('PUT', `/api/pfp/portfolios/${portfolioId}`, updateDataEmpty, token);
        
        if (updateEmptyResponse.status === 200) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkEmptyResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
            const emptyClassIds = checkEmptyResponse.data.classes?.map(c => c.id) || [];
            
            console.log(`   Classes после пустого массива: [${emptyClassIds.join(', ')}]`);
            
            if (emptyClassIds.length === 0) {
                console.log('   ✅ УСПЕХ! Пустой массив правильно удалил все classes!');
            } else {
                console.log(`   ❌ ОШИБКА! Ожидался пустой массив, получено: [${emptyClassIds.join(', ')}]`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ ТЕСТ ЗАВЕРШЕН');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ ОШИБКА:', error.message);
        console.error('='.repeat(60));
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();








