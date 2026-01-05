require('dotenv').config();
const nsjApiService = require('../src/services/nsjApiService');

async function runTest() {
    console.log('Starting Direct NSJ API Test...');

    // Define a minimal valid payload
    const params = {
        target_amount: 1000000, // 1M RUB
        term_months: 60,        // 5 years
        payment_variant: 12,    // Monthly
        program: 'test',
        client: {
            birth_date: '1990-01-01',
            sex: 'male',
            phone: '+79991234567',
            fio: 'Тестовый Клиент Иванович',
            email: 'test@example.com'
        }
    };

    console.log('Payload:', JSON.stringify(params, null, 2));

    try {
        const result = await nsjApiService.calculateLifeInsurance(params);
        console.log('\n=== SQL API SUCCESS ===');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('\n=== SQL API FAILED ===');
        console.error('Status:', error.status);
        console.error('Message:', error.message);
        if (error.rawResponse) {
            console.error('Raw Response Snapshot:', error.rawResponse.substring(0, 500));
        }
        if (error.full_response) {
            console.error('Full Response Data:', JSON.stringify(error.full_response, null, 2));
        }
    }
}

runTest();
