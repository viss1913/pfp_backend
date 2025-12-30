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

        console.log(`\n📤 ${method} ${path}`);

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
        console.log('🧪 ТЕСТ: Изменение classes с [2,3,4] на [1,2,3,4]');
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

        // Шаг 2: Получаем текущее состояние ДО обновления
        console.log('\n📝 ШАГ 2: Получение текущего состояния (ДО)');
        const beforeResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (beforeResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const beforePortfolio = beforeResponse.data;
        const beforeClassIds = beforePortfolio.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        
        console.log(`✅ Портфель: "${beforePortfolio.name}"`);
        console.log(`   Classes ДО: [${beforeClassIds.join(', ') || 'нет'}]`);
        console.log(`   Количество: ${beforeClassIds.length}`);

        // Шаг 3: Подготавливаем данные для обновления - ДОБАВЛЯЕМ класс 1
        console.log('\n📝 ШАГ 3: Подготовка данных для обновления');
        
        // Изменяем с [2,3,4] на [1,2,3,4] - добавляем класс 1 (Пенсия)
        const newClassIds = [1, 2, 3, 4];
        console.log(`   Изменяем classes: [${beforeClassIds.join(', ')}] -> [${newClassIds.join(', ')}]`);
        console.log(`   Добавляем класс: 1 (Пенсия)`);
        
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
            // Отправляем как массив объектов с ДОБАВЛЕННЫМ классом 1
            classes: [
                { id: 1, code: "PENSION", name: "Пенсия" },
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

        console.log('\n📤 Отправляем PUT запрос:');
        console.log(`   classes: [${newClassIds.join(', ')}]`);

        // Шаг 4: Отправляем PUT запрос
        console.log('\n📝 ШАГ 4: Отправка PUT запроса');
        const updateResponse = await makeRequest('PUT', `/api/pfp/portfolios/${portfolioId}`, updateData, token);
        
        if (updateResponse.status !== 200) {
            console.error('❌ Ошибка обновления:', JSON.stringify(updateResponse.data, null, 2));
            throw new Error(`Ошибка обновления: ${updateResponse.status}`);
        }
        console.log('✅ PUT запрос выполнен успешно');
        
        const updatedClassIds = updateResponse.data.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        console.log(`   Classes в ответе PUT: [${updatedClassIds.join(', ') || 'нет'}]`);

        // Ждем немного, чтобы БД обновилась
        console.log('\n⏳ Ждем 1.5 секунды для обновления БД...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Шаг 5: Проверяем результат ПОСЛЕ обновления
        console.log('\n📝 ШАГ 5: Проверка результата (ПОСЛЕ)');
        const afterResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (afterResponse.status !== 200) {
            throw new Error('Не удалось получить обновленный портфель');
        }
        const afterPortfolio = afterResponse.data;
        const afterClassIds = afterPortfolio.classes?.map(c => c.id).sort((a, b) => a - b) || [];
        
        console.log(`✅ Портфель получен: "${afterPortfolio.name}"`);
        console.log(`   Classes ПОСЛЕ: [${afterClassIds.join(', ') || 'нет'}]`);
        console.log(`   Количество: ${afterClassIds.length}`);

        // Шаг 6: Сравнение и вывод результата
        console.log('\n' + '='.repeat(60));
        console.log('📊 РЕЗУЛЬТАТ ПРОВЕРКИ:');
        console.log('='.repeat(60));
        console.log(`ДО:    [${beforeClassIds.join(', ') || 'нет'}] (${beforeClassIds.length} шт.)`);
        console.log(`ПОСЛЕ: [${afterClassIds.join(', ') || 'нет'}] (${afterClassIds.length} шт.)`);
        console.log(`Ожидалось: [${newClassIds.join(', ')}] (${newClassIds.length} шт.)`);

        const expectedStr = JSON.stringify(newClassIds);
        const actualStr = JSON.stringify(afterClassIds);
        const beforeStr = JSON.stringify(beforeClassIds);

        console.log('\n' + '='.repeat(60));
        if (actualStr === expectedStr) {
            console.log('✅ УСПЕХ! Classes обновлены правильно!');
            if (beforeStr !== actualStr) {
                console.log('   ✅ ИЗМЕНЕНИЯ ПРИМЕНЕНЫ В БД!');
                console.log(`   ✅ Добавлен класс 1 (Пенсия)`);
            } else {
                console.log('   ⚠️  Classes уже были такими (изменений не было)');
            }
        } else {
            console.log('❌ ОШИБКА! Classes не соответствуют ожидаемым!');
            console.log(`   Ожидалось: [${newClassIds.join(', ')}]`);
            console.log(`   Получено:   [${afterClassIds.join(', ')}]`);
        }

        // Детальная информация
        if (afterClassIds.length > 0) {
            console.log('\n📋 Детали classes:');
            afterPortfolio.classes.forEach((cls, index) => {
                console.log(`   ${index + 1}. ID: ${cls.id}, Код: ${cls.code}, Название: ${cls.name}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('💡 ПРОВЕРЬТЕ В БД СЕЙЧАС:');
        console.log('='.repeat(60));
        console.log('Выполните SQL запрос:');
        console.log(`   SELECT id, name, classes FROM portfolios WHERE id = ${portfolioId};`);
        console.log(`\nОжидается в поле classes: [${newClassIds.join(', ')}]`);
        console.log(`\nДО было: [${beforeClassIds.join(', ')}]`);
        console.log(`ПОСЛЕ должно быть: [${newClassIds.join(', ')}]`);
        console.log('\n' + '='.repeat(60));
        console.log('✅ ТЕСТ ЗАВЕРШЕН - ПРОВЕРЬТЕ БД!');
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








