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
                    console.log('📋 Response:', JSON.stringify(parsed, null, 2));
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
        console.log('🚀 Тестирование обновления портфеля на Railway');
        console.log('='.repeat(60));

        // Шаг 1: Логин
        console.log('\n📝 ШАГ 1: Логин');
        const loginResponse = await makeRequest('POST', '/api/auth/login', adminCredentials);
        if (loginResponse.status !== 200 || !loginResponse.data.token) {
            throw new Error('Не удалось получить токен');
        }
        const token = loginResponse.data.token;
        console.log('✅ Токен получен');

        // Шаг 2: Получить портфель
        console.log('\n📝 ШАГ 2: Получение портфеля ID=1');
        const portfolioResponse = await makeRequest('GET', '/api/pfp/portfolios/1', null, token);
        if (portfolioResponse.status !== 200) {
            throw new Error('Не удалось получить портфель');
        }
        const portfolio = portfolioResponse.data;
        console.log(`✅ Портфель получен: "${portfolio.name}"`);

        // Шаг 3: Получить список продуктов
        console.log('\n📝 ШАГ 3: Получение списка продуктов');
        const productsResponse = await makeRequest('GET', '/api/pfp/products', null, token);
        if (productsResponse.status !== 200 || !Array.isArray(productsResponse.data)) {
            throw new Error('Не удалось получить продукты');
        }
        const products = productsResponse.data;
        console.log(`✅ Найдено продуктов: ${products.length}`);
        products.forEach(p => console.log(`   - ID: ${p.id}, Name: ${p.name}`));

        // Шаг 4: Найти консервативный профиль и добавить продукт
        console.log('\n📝 ШАГ 4: Подготовка данных для обновления');
        
        if (!portfolio.riskProfiles || !Array.isArray(portfolio.riskProfiles)) {
            throw new Error('У портфеля нет риск-профилей');
        }

        // Находим консервативный профиль
        let conservativeProfile = portfolio.riskProfiles.find(p => p.profile_type === 'CONSERVATIVE');
        
        if (!conservativeProfile) {
            // Создаем новый консервативный профиль
            console.log('⚠️  Консервативный профиль не найден, создаем новый');
            conservativeProfile = {
                profile_type: 'CONSERVATIVE',
                instruments: []
            };
            portfolio.riskProfiles.push(conservativeProfile);
        }

        // Находим продукт, которого еще нет в INITIAL_CAPITAL
        const existingProductIds = conservativeProfile.instruments
            ?.filter(inst => inst.bucket_type === 'INITIAL_CAPITAL')
            .map(inst => inst.product_id) || [];

        const newProduct = products.find(p => !existingProductIds.includes(p.id));
        
        if (!newProduct) {
            throw new Error('Нет доступных продуктов для добавления');
        }

        console.log(`✅ Добавляем продукт: ID=${newProduct.id}, Name="${newProduct.name}"`);

        // Добавляем новый продукт в INITIAL_CAPITAL
        if (!conservativeProfile.instruments) {
            conservativeProfile.instruments = [];
        }

        // Если есть другие инструменты в INITIAL_CAPITAL, пересчитываем доли
        const initialCapitalInstruments = conservativeProfile.instruments.filter(
            inst => inst.bucket_type === 'INITIAL_CAPITAL'
        );

        if (initialCapitalInstruments.length > 0) {
            // Уменьшаем доли существующих инструментов
            const totalShare = initialCapitalInstruments.reduce((sum, inst) => sum + parseFloat(inst.share_percent || 0), 0);
            const newShare = 30; // Новая доля для нового продукта
            const remainingShare = 100 - newShare;
            
            // Пересчитываем доли пропорционально
            initialCapitalInstruments.forEach(inst => {
                const oldShare = parseFloat(inst.share_percent || 0);
                inst.share_percent = Math.round((oldShare / totalShare) * remainingShare * 100) / 100;
            });

            // Добавляем новый продукт
            conservativeProfile.instruments.push({
                product_id: newProduct.id,
                bucket_type: 'INITIAL_CAPITAL',
                share_percent: newShare,
                order_index: initialCapitalInstruments.length + 1
            });
        } else {
            // Если нет других инструментов, новый продукт получает 100%
            conservativeProfile.instruments.push({
                product_id: newProduct.id,
                bucket_type: 'INITIAL_CAPITAL',
                share_percent: 100,
                order_index: 1
            });
        }

        // Подготавливаем данные для обновления
        const updateData = {
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

        console.log('\n📤 Данные для обновления:');
        console.log(JSON.stringify(updateData, null, 2));

        // Шаг 5: Обновляем портфель
        console.log('\n📝 ШАГ 5: Обновление портфеля');
        const updateResponse = await makeRequest('PUT', '/api/pfp/portfolios/1', updateData, token);
        
        if (updateResponse.status === 200) {
            console.log('\n✅ Портфель успешно обновлен!');
            
            // Шаг 6: Проверяем результат
            console.log('\n📝 ШАГ 6: Проверка обновленного портфеля');
            const checkResponse = await makeRequest('GET', '/api/pfp/portfolios/1', null, token);
            
            if (checkResponse.status === 200) {
                const updatedPortfolio = checkResponse.data;
                const updatedConservative = updatedPortfolio.riskProfiles?.find(p => p.profile_type === 'CONSERVATIVE');
                
                console.log('\n📊 Консервативный профиль после обновления:');
                if (updatedConservative && updatedConservative.instruments) {
                    updatedConservative.instruments.forEach((inst, idx) => {
                        console.log(`   ${idx + 1}. Product ID: ${inst.product_id}, Bucket: ${inst.bucket_type}, Share: ${inst.share_percent}%`);
                    });
                }
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







