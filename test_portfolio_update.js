const https = require('https');
const http = require('http');

// Настройки
const BASE_URL = process.env.API_URL || 'pfpbackend-production.up.railway.app';
const PORT = process.env.API_PORT || 3000;
const USE_HTTPS = true; // Railway всегда использует HTTPS

const adminCredentials = {
    email: 'admin@pfp.local',
    password: 'admin123'
};

// Вспомогательная функция для HTTP запросов
function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const protocol = USE_HTTPS ? https : http;
        
        // Обработка URL
        let urlString;
        if (BASE_URL.startsWith('http://') || BASE_URL.startsWith('https://')) {
            urlString = BASE_URL;
        } else {
            urlString = USE_HTTPS ? `https://${BASE_URL}` : `http://${BASE_URL}:${PORT}`;
        }
        
        const url = new URL(urlString);
        
        const requestOptions = {
            hostname: url.hostname,
            port: url.port || (USE_HTTPS ? 443 : (PORT || 3000)),
            path: options.path,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        if (data) {
            const postData = JSON.stringify(data);
            requestOptions.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        console.log(`\n📤 ${requestOptions.method} ${requestOptions.path}`);
        if (data) {
            console.log('📦 Body:', JSON.stringify(data, null, 2));
        }

        const req = protocol.request(requestOptions, (res) => {
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

        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Шаг 1: Логин и получение токена
async function step1_login() {
    console.log('\n' + '='.repeat(60));
    console.log('ШАГ 1: Логин и получение токена');
    console.log('='.repeat(60));
    
    const response = await makeRequest({
        method: 'POST',
        path: '/api/auth/login'
    }, adminCredentials);

    if (response.status === 200 && response.data.token) {
        console.log('✅ Токен получен успешно!');
        return response.data.token;
    } else {
        throw new Error('Не удалось получить токен: ' + JSON.stringify(response.data));
    }
}

// Шаг 2: Получить список портфелей
async function step2_getPortfolios(token) {
    console.log('\n' + '='.repeat(60));
    console.log('ШАГ 2: Получение списка портфелей');
    console.log('='.repeat(60));
    
    const response = await makeRequest({
        method: 'GET',
        path: '/api/pfp/portfolios',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 200 && Array.isArray(response.data)) {
        console.log(`✅ Найдено портфелей: ${response.data.length}`);
        
        // Найти консервативный портфель
        const conservativePortfolio = response.data.find(p => {
            if (p.riskProfiles && Array.isArray(p.riskProfiles)) {
                return p.riskProfiles.some(rp => rp.profile_type === 'CONSERVATIVE');
            }
            return false;
        });

        if (conservativePortfolio) {
            console.log(`\n✅ Найден консервативный портфель: ID=${conservativePortfolio.id}, Name="${conservativePortfolio.name}"`);
            return conservativePortfolio;
        } else {
            // Если не нашли, возьмем первый портфель
            console.log(`\n⚠️  Консервативный портфель не найден, используем первый: ID=${response.data[0].id}`);
            return response.data[0];
        }
    } else {
        throw new Error('Не удалось получить портфели: ' + JSON.stringify(response.data));
    }
}

// Шаг 3: Получить список продуктов
async function step3_getProducts(token) {
    console.log('\n' + '='.repeat(60));
    console.log('ШАГ 3: Получение списка продуктов');
    console.log('='.repeat(60));
    
    const response = await makeRequest({
        method: 'GET',
        path: '/api/pfp/products',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 200 && Array.isArray(response.data)) {
        console.log(`✅ Найдено продуктов: ${response.data.length}`);
        if (response.data.length > 0) {
            console.log(`\n✅ Используем продукт: ID=${response.data[0].id}, Name="${response.data[0].name}"`);
            return response.data[0];
        } else {
            throw new Error('Нет доступных продуктов');
        }
    } else {
        throw new Error('Не удалось получить продукты: ' + JSON.stringify(response.data));
    }
}

// Шаг 4: Получить полную информацию о портфеле
async function step4_getPortfolioDetails(token, portfolioId) {
    console.log('\n' + '='.repeat(60));
    console.log('ШАГ 4: Получение детальной информации о портфеле');
    console.log('='.repeat(60));
    
    const response = await makeRequest({
        method: 'GET',
        path: `/api/pfp/portfolios/${portfolioId}`,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 200) {
        console.log('✅ Детали портфеля получены');
        console.log('\n📊 Текущие риск-профили:');
        if (response.data.riskProfiles && Array.isArray(response.data.riskProfiles)) {
            response.data.riskProfiles.forEach((rp, idx) => {
                console.log(`  ${idx + 1}. ${rp.profile_type}: ${rp.instruments?.length || 0} инструментов`);
                if (rp.instruments && rp.instruments.length > 0) {
                    rp.instruments.forEach((inst, i) => {
                        console.log(`     - Инструмент ${i + 1}: product_id=${inst.product_id}, bucket_type=${inst.bucket_type}, share=${inst.share_percent}%`);
                    });
                }
            });
        }
        return response.data;
    } else {
        throw new Error('Не удалось получить детали портфеля: ' + JSON.stringify(response.data));
    }
}

// Шаг 5: Обновить портфель - добавить продукт в консервативный профиль
async function step5_updatePortfolio(token, portfolio, product) {
    console.log('\n' + '='.repeat(60));
    console.log('ШАГ 5: Обновление портфеля - добавление продукта');
    console.log('='.repeat(60));
    
    // Найти или создать консервативный профиль
    let conservativeProfile = portfolio.riskProfiles?.find(rp => rp.profile_type === 'CONSERVATIVE');
    
    if (!conservativeProfile) {
        // Создаем новый консервативный профиль
        console.log('⚠️  Консервативный профиль не найден, создаем новый');
        conservativeProfile = {
            profile_type: 'CONSERVATIVE',
            instruments: []
        };
        if (!portfolio.riskProfiles) {
            portfolio.riskProfiles = [];
        }
        portfolio.riskProfiles.push(conservativeProfile);
    }

    // Проверяем, есть ли уже этот продукт в INITIAL_CAPITAL
    const existingInstrument = conservativeProfile.instruments?.find(
        inst => inst.product_id === product.id && inst.bucket_type === 'INITIAL_CAPITAL'
    );

    if (existingInstrument) {
        console.log(`⚠️  Продукт ${product.id} уже есть в INITIAL_CAPITAL, обновляем долю на 50%`);
        existingInstrument.share_percent = 50;
    } else {
        // Добавляем новый инструмент
        console.log(`✅ Добавляем продукт ${product.id} в INITIAL_CAPITAL с долей 50%`);
        
        if (!conservativeProfile.instruments) {
            conservativeProfile.instruments = [];
        }

        // Если есть другие инструменты, уменьшаем их доли
        if (conservativeProfile.instruments.length > 0) {
            const totalShare = conservativeProfile.instruments.reduce((sum, inst) => sum + (inst.share_percent || 0), 0);
            if (totalShare > 0) {
                // Нормализуем доли так, чтобы новый инструмент был 50%, остальные пропорционально
                const scale = 0.5 / totalShare;
                conservativeProfile.instruments.forEach(inst => {
                    inst.share_percent = Math.round(inst.share_percent * scale * 100) / 100;
                });
            }
        }

        conservativeProfile.instruments.push({
            product_id: product.id,
            bucket_type: 'INITIAL_CAPITAL',
            share_percent: 50,
            order_index: conservativeProfile.instruments.length + 1
        });
    }

    // Подготавливаем данные для обновления
    const updateData = {
        riskProfiles: portfolio.riskProfiles.map(rp => ({
            profile_type: rp.profile_type,
            instruments: (rp.instruments || []).map(inst => ({
                product_id: inst.product_id,
                bucket_type: inst.bucket_type,
                share_percent: inst.share_percent,
                order_index: inst.order_index || null
            }))
        }))
    };

    console.log('\n📤 Отправляем обновление:');
    console.log(JSON.stringify(updateData, null, 2));

    const response = await makeRequest({
        method: 'PUT',
        path: `/api/pfp/portfolios/${portfolio.id}`,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }, updateData);

    if (response.status === 200) {
        console.log('\n✅ Портфель успешно обновлен!');
        return response.data;
    } else {
        throw new Error('Не удалось обновить портфель: ' + JSON.stringify(response.data));
    }
}

// Шаг 6: Проверка обновленного портфеля
async function step6_verifyPortfolio(token, portfolioId) {
    console.log('\n' + '='.repeat(60));
    console.log('ШАГ 6: Проверка обновленного портфеля');
    console.log('='.repeat(60));
    
    const response = await makeRequest({
        method: 'GET',
        path: `/api/pfp/portfolios/${portfolioId}`,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (response.status === 200) {
        console.log('✅ Портфель успешно получен после обновления');
        console.log('\n📊 Обновленные риск-профили:');
        if (response.data.riskProfiles && Array.isArray(response.data.riskProfiles)) {
            response.data.riskProfiles.forEach((rp, idx) => {
                console.log(`\n  ${idx + 1}. ${rp.profile_type}:`);
                if (rp.instruments && rp.instruments.length > 0) {
                    rp.instruments.forEach((inst, i) => {
                        console.log(`     - Инструмент ${i + 1}:`);
                        console.log(`       product_id: ${inst.product_id}`);
                        console.log(`       bucket_type: ${inst.bucket_type}`);
                        console.log(`       share_percent: ${inst.share_percent}%`);
                        console.log(`       order_index: ${inst.order_index || 'null'}`);
                    });
                } else {
                    console.log(`     (нет инструментов)`);
                }
            });
        }
        return response.data;
    } else {
        throw new Error('Не удалось получить обновленный портфель: ' + JSON.stringify(response.data));
    }
}

// Главная функция
async function runTest() {
    try {
        console.log('🚀 Начинаем тестирование обновления портфеля');
        let apiUrl;
        if (BASE_URL.startsWith('http://') || BASE_URL.startsWith('https://')) {
            apiUrl = BASE_URL;
        } else {
            apiUrl = `${USE_HTTPS ? 'https://' : 'http://'}${BASE_URL}${!USE_HTTPS ? ':' + PORT : ''}`;
        }
        console.log(`📍 API URL: ${apiUrl}`);

        // Шаг 1: Логин
        const token = await step1_login();

        // Шаг 2: Получить портфели
        const portfolio = await step2_getPortfolios(token);

        // Шаг 3: Получить продукты
        const product = await step3_getProducts(token);

        // Шаг 4: Получить детали портфеля
        const portfolioDetails = await step4_getPortfolioDetails(token, portfolio.id);

        // Шаг 5: Обновить портфель
        const updatedPortfolio = await step5_updatePortfolio(token, portfolioDetails, product);

        // Шаг 6: Проверить обновленный портфель
        await step6_verifyPortfolio(token, portfolio.id);

        console.log('\n' + '='.repeat(60));
        console.log('✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
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

// Запуск
runTest();

