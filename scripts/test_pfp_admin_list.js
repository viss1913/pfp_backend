const adminRepository = require('../src/repositories/adminRepository');

async function test() {
    try {
        console.log('--- Fetching PFP Calculations from Railway DB ---');
        const results = await adminRepository.getPfpCalculations({ limit: 5 });

        if (results.data.length === 0) {
            console.log('No clients with PFP found in database.');
        } else {
            console.table(results.data.map(item => ({
                ID: item.pfp_id,
                Client: item.client_fio,
                Agent: item.agent_fio,
                Status: item.status,
                Calc: item.has_calculation ? 'YES' : 'NO',
                Date: new Date(item.created_at).toLocaleDateString()
            })));
            console.log('\nTotal found:', results.pagination.total);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    } finally {
        process.exit();
    }
}

test();
