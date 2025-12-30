const https = require('https');
const db = require('./src/config/database');

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

        console.log(`\n📤 ${method} ${path}`);
        if (data && data.classes) {
            console.log('📦 Classes in request:', JSON.stringify(data.classes, null, 2));
        }

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                console.log(`📥 Status: ${res.statusCode} ${res.statusMessage}`);
                
                try {
                    const parsed = JSON.parse(responseData);
                    if (res.statusCode < 400) {
                        if (parsed.classes) {
                            console.log('📋 Classes in response:', JSON.stringify(parsed.classes, null, 2));
                        }
                    } else {
                        console.log('❌ Error:', JSON.stringify(parsed, null, 2));
                    }
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    console.log('📋 Response (text):', responseData);
                    resolve({ status: res.statusCode, data: responseData });
                }
            });
        });

        req.on('error', (e) => {
            console.error(`❌ Request error: ${e.message}`);
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

// Функция для проверки состояния БД
async function checkDatabaseState(portfolioId, label) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 ${label} - Состояние БД для портфеля ID=${portfolioId}`);
    console.log('='.repeat(60));
    
    try {
        const classLinks = await db('portfolio_class_links')
            .where('portfolio_id', portfolioId)
            .select('*');
        
        console.log(`\n🔗 Связи в portfolio_class_links (${classLinks.length} записей):`);
        if (classLinks.length > 0) {
            for (const link of classLinks) {
                const classInfo = await db('portfolio_classes')
                    .where('id', link.class_id)
                    .first();
                console.log(`   - portfolio_id: ${link.portfolio_id}, class_id: ${link.class_id} (${classInfo?.name || 'unknown'})`);
            }
        } else {
            console.log('   (нет связей)');
        }
        
        return classLinks;
    } catch (error) {
        console.error(`❌ Ошибка при проверке БД: ${error.message}`);
        return [];
    }
}

async function main() {
    try {
        console.log('🚀 Тест обновления classes с проверкой БД');
        console.log('='.repeat(60));

        const portfolioId = 1;

        // Шаг 0: Проверяем состояние БД ДО обновления
        const beforeLinks = await checkDatabaseState(portfolioId, 'ДО обновления');

        // Шаг 1: Логин
        console.log('\n📝 ШАГ 1: Логин');
        const loginResponse = await makeRequest('POST', '/api/auth/login', adminCredentials);
        if (loginResponse.status !== 200 || !loginResponse.data.token) {
            throw new Error('Не удалось получить токен');
        }
        const token = loginResponse.data.token;
        console.log('✅ Токен получен');

        // Шаг 2: Получить текущий портфель
        console.log('\n📝 ШАГ 2: Получение текущего портфеля');
        const portfolioResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        if (portfolioResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const portfolio = portfolioResponse.data;
        console.log(`✅ Портфель получен: "${portfolio.name}"`);
        console.log(`   Текущие classes: ${portfolio.classes?.map(c => `${c.id} (${c.name})`).join(', ') || 'нет'}`);

        // Шаг 3: Подготавливаем данные для обновления (classes как массив объектов)
        console.log('\n📝 ШАГ 3: Подготовка данных для обновления');
        
        // Данные, которые отправляет фронтенд (classes как массив объектов)
        const updateData = {
            name: portfolio.name,
            currency: portfolio.currency,
            amount_from: parseFloat(portfolio.amount_from),
            amount_to: parseFloat(portfolio.amount_to),
            term_from_months: portfolio.term_from_months,
            term_to_months: portfolio.term_to_months,
            age_from: portfolio.age_from,
            age_to: portfolio.age_to,
            investor_type: portfolio.investor_type,
            gender: portfolio.gender,
            // КЛЮЧЕВОЙ МОМЕНТ: отправляем classes как массив объектов (как делает фронтенд)
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
            riskProfiles: portfolio.riskProfiles.map(rp => ({
                profile_type: rp.profile_type,
                instruments: (rp.instruments || []).map(inst => ({
                    product_id: typeof inst.product_id === 'string' ? parseInt(inst.product_id) : inst.product_id,
                    bucket_type: inst.bucket_type,
                    share_percent: typeof inst.share_percent === 'string' ? parseFloat(inst.share_percent) : inst.share_percent,
                    order_index: inst.order_index || null
                }))
            }))
        };

        console.log('\n📤 Отправляем classes как массив объектов:');
        console.log(JSON.stringify(updateData.classes, null, 2));

        // Шаг 4: Обновляем портфель
        console.log('\n📝 ШАГ 4: Отправка PUT запроса');
        const updateResponse = await makeRequest('PUT', `/api/pfp/portfolios/${portfolioId}`, updateData, token);
        
        if (updateResponse.status !== 200) {
            throw new Error(`Ошибка обновления: ${updateResponse.status} - ${JSON.stringify(updateResponse.data)}`);
        }
        console.log('✅ Портфель обновлен');

        // Шаг 5: Проверяем состояние БД ПОСЛЕ обновления
        const afterLinks = await checkDatabaseState(portfolioId, 'ПОСЛЕ обновления');

        // Шаг 6: Получаем обновленный портфель через API
        console.log('\n📝 ШАГ 6: Проверка через API');
        const checkResponse = await makeRequest('GET', `/api/pfp/portfolios/${portfolioId}`, null, token);
        
        if (checkResponse.status === 200) {
            const updatedPortfolio = checkResponse.data;
            console.log(`\n📊 Результат через API:`);
            console.log(`   Название: ${updatedPortfolio.name}`);
            console.log(`   Классы: ${updatedPortfolio.classes?.map(c => `${c.id} (${c.name})`).join(', ') || 'нет'}`);
        }

        // Шаг 7: Сравнение
        console.log(`\n${'='.repeat(60)}`);
        console.log('📊 СРАВНЕНИЕ');
        console.log('='.repeat(60));
        console.log(`ДО:  ${beforeLinks.length} связей - class_ids: [${beforeLinks.map(l => l.class_id).join(', ')}]`);
        console.log(`ПОСЛЕ: ${afterLinks.length} связей - class_ids: [${afterLinks.map(l => l.class_id).join(', ')}]`);
        
        const expectedClassIds = [2, 3, 4];
        const actualClassIds = afterLinks.map(l => l.class_id).sort((a, b) => a - b);
        const expectedSorted = [...expectedClassIds].sort((a, b) => a - b);
        
        if (JSON.stringify(actualClassIds) === JSON.stringify(expectedSorted)) {
            console.log('\n✅ УСПЕХ! Classes обновлены правильно в БД!');
        } else {
            console.log('\n❌ ОШИБКА! Classes в БД не соответствуют ожидаемым!');
            console.log(`   Ожидалось: [${expectedSorted.join(', ')}]`);
            console.log(`   Получено: [${actualClassIds.join(', ')}]`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ ТЕСТ ЗАВЕРШЕН');
        console.log('='.repeat(60));

        // Закрываем соединение с БД
        await db.destroy();

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ ОШИБКА:', error.message);
        console.error('='.repeat(60));
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        await db.destroy();
        process.exit(1);
    }
}

main();









