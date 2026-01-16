const nsjApiService = require('../src/services/nsjApiService');
const nsjService = require('../src/services/nsjService');

async function test() {
    console.log('Testing NSJ Api Service...');
    // We can't easily call real API without keys/internet, but we can check the return keys
    // if we mock the callApi method.

    const mockResults = {
        success: true,
        term: 10,
        risks: [{ name: 'Test' }],
        premium: 100,
        limit: 1000,
        payments_list: [1, 2, 3],
        warnings: ['Warning'],
        rvd: {},
        cashSurrenderValues: {}
    };

    // Monkey patch callApi to return mock data
    nsjApiService.callApi = async () => ({
        success: true,
        data: { results: mockResults }
    });

    const resultApi = await nsjApiService.calculateLifeInsurance({
        target_amount: 1000,
        term_months: 120
    });

    console.log('NSJ Api Service Result keys:', Object.keys(resultApi));
    const forbiddenKeys = ['payments_list', 'rvd', 'cashSurrenderValues', 'warnings', 'calculation_date', 'raw_response'];
    const foundForbidden = forbiddenKeys.filter(key => resultApi.hasOwnProperty(key));

    if (foundForbidden.length > 0) {
        console.error('FAILED: Found forbidden keys in NSJ Api Service:', foundForbidden);
    } else {
        console.log('SUCCESS: No forbidden keys in NSJ Api Service');
    }

    console.log('\nTesting NSJ Service...');
    nsjService.makeRequest = async () => ({
        success: true,
        data: { results: mockResults }
    });

    const resultService = await nsjService.calculateLifeInsurance({
        target_amount: 1000,
        term_months: 120
    });

    console.log('NSJ Service Result keys:', Object.keys(resultService));
    const foundForbiddenService = forbiddenKeys.filter(key => resultService.hasOwnProperty(key));

    if (foundForbiddenService.length > 0) {
        console.error('FAILED: Found forbidden keys in NSJ Service:', foundForbiddenService);
    } else {
        console.log('SUCCESS: No forbidden keys in NSJ Service');
    }
}

test().catch(console.error);
