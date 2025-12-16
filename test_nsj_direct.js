const https = require('https');

// Параметры подключения
const API_URL = 'https://demo.avinfors.ru/api-life/api/flow/';
const API_KEY = 'ede88df2c022e810fedc09d4';

// Данные для запроса (Мужчина, 45 лет, лимит 2 млн, срок 10 лет)
const requestData = {
    operation: 'Contract.LifeEndowment.calculate',
    data: {
        beginDate: new Date().toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '.') + ' 00:00:00',
        insConditions: {
            program: 'test',
            currency: 'RUR',
            paymentVariant: 0,
            term: 10
        },
        policyHolder: {
            dob: '01.01.1979',
            age: 45,
            sex: 'male'
        },
        insuredPerson: {
            isPolicyHolder: true
        },
        calcData: {
            valuationType: 'byLimit',
            limit: 2000000
        }
    }
};

console.log('='.repeat(60));
console.log('Прямой запрос к NSJ API');
console.log('='.repeat(60));
console.log('URL:', API_URL);
console.log('API Key:', API_KEY.substring(0, 10) + '...');
console.log('\nЗапрос:');
console.log(JSON.stringify(requestData, null, 2));
console.log('\nОтправка запроса...\n');

const url = new URL(API_URL);
const postData = JSON.stringify(requestData);

const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = https.request(options, (res) => {
    console.log(`Статус ответа: ${res.statusCode} ${res.statusMessage}`);
    console.log('Заголовки ответа:');
    console.log(JSON.stringify(res.headers, null, 2));
    console.log('\nТело ответа:');
    
    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        try {
            // Извлекаем JSON из ответа (может содержать PHP warnings)
            let jsonData = responseData;
            const jsonStart = responseData.indexOf('{');
            if (jsonStart > 0) {
                console.log('В ответе есть текст до JSON (первые 200 символов):');
                console.log(responseData.substring(0, jsonStart));
                jsonData = responseData.substring(jsonStart);
            }
            
            const parsed = JSON.parse(jsonData);
            console.log(JSON.stringify(parsed, null, 2));
            
            if (parsed.success) {
                console.log('\n✅ Запрос успешен!');
                if (parsed.data && parsed.data.results) {
                    console.log('Результаты расчета:');
                    console.log('- Премия:', parsed.data.results.premium || parsed.data.results.premiumRUR);
                    console.log('- Лимит:', parsed.data.results.limit);
                    console.log('- Риски:', parsed.data.results.risks?.length || 0);
                }
            } else {
                console.log('\n❌ Запрос вернул success: false');
                console.log('Ошибки:', parsed.errors || []);
            }
        } catch (e) {
            console.error('\n❌ Ошибка парсинга JSON:', e.message);
            console.log('Сырой ответ (первые 1000 символов):');
            console.log(responseData.substring(0, 1000));
        }
    });
});

req.on('error', (e) => {
    console.error('\n❌ Ошибка запроса:', e.message);
    console.error('Код ошибки:', e.code);
});

req.write(postData);
req.end();
















