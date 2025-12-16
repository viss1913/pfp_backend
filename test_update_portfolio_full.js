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

        console.log(`\n📤 ${method} ${path}`);
        if (data) {
            console.log('📦 Body:', JSON.stringify(data, null, 2));
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
                        console.log('📋 Response:', JSON.stringify(parsed, null, 2));
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

async function main() {
    try {
        console.log('🚀 Обновление портфеля (полный объект)');
        console.log('='.repeat(60));

        // Шаг 1: Логин
        console.log('\n📝 ШАГ 1: Логин');
        const loginResponse = await makeRequest('POST', '/api/auth/login', adminCredentials);
        if (loginResponse.status !== 200 || !loginResponse.data.token) {
            throw new Error('Не удалось получить токен');
        }
        const token = loginResponse.data.token;
        console.log('✅ Токен получен');

        // Шаг 2: Получить текущий портфель
        console.log('\n📝 ШАГ 2: Получение текущего портфеля ID=1');
        const portfolioResponse = await makeRequest('GET', '/api/pfp/portfolios/1', null, token);
        if (portfolioResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const portfolio = portfolioResponse.data;
        console.log(`✅ Портфель получен: "${portfolio.name}"`);

        // Шаг 3: Подготавливаем полный объект для обновления
        console.log('\n📝 ШАГ 3: Подготовка полного объекта для обновления');
        
        // Убираем класс "Пенсия" (ID=1)
        const currentClassIds = portfolio.classes?.map(c => c.id) || [];
        const newClassIds = currentClassIds.filter(id => id !== 1);
        console.log(`Классы: [${currentClassIds.join(', ')}] -> [${newClassIds.join(', ')}] (убрали Пенсию)`);

        // Формируем полный объект для обновления
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
            classes: newClassIds, // Обновленные классы
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

        console.log('\n📤 Полный объект для обновления:');
        console.log(JSON.stringify(updateData, null, 2));

        // Шаг 4: Обновляем портфель
        console.log('\n📝 ШАГ 4: Отправка полного объекта на обновление');
        const updateResponse = await makeRequest('PUT', '/api/pfp/portfolios/1', updateData, token);
        
        if (updateResponse.status === 200) {
            console.log('\n✅ Портфель успешно обновлен!');
            
            // Шаг 5: Проверяем результат
            console.log('\n📝 ШАГ 5: Проверка обновленного портфеля');
            const checkResponse = await makeRequest('GET', '/api/pfp/portfolios/1', null, token);
            
            if (checkResponse.status === 200) {
                const updatedPortfolio = checkResponse.data;
                console.log('\n📊 Результат:');
                console.log(`   Название: ${updatedPortfolio.name}`);
                console.log(`   Классы: ${updatedPortfolio.classes?.map(c => c.name).join(', ') || 'нет'}`);
                console.log(`   Риск-профилей: ${updatedPortfolio.riskProfiles?.length || 0}`);
            }
        } else {
            throw new Error(`Ошибка обновления: ${updateResponse.status} - ${JSON.stringify(updateResponse.data)}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ ВСЕ УСПЕШНО!');
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







