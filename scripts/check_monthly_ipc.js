const axios = require('axios');
const https = require('https');
const XLSX = require('xlsx');

async function checkMonthly() {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    const url = 'https://rosstat.gov.ru/storage/mediabank/ipc_mes_01-2026.xlsx';

    console.log(`📡 Downloading Monthly: ${url}`);
    try {
        const res = await axios.get(url, { httpsAgent: agent, responseType: 'arraybuffer', headers });
        const wb = XLSX.read(res.data, { type: 'buffer' });
        console.log('Sheets:', wb.SheetNames);

        // Лист '01' - скорее всего там агрегаты
        const ws = wb.Sheets['01'];
        if (!ws) {
            console.log('Sheet 01 not found');
            return;
        }
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        console.log('--- Sheet 01 first 30 rows:');
        data.slice(0, 30).forEach((row, i) => {
            console.log(`Row ${i}:`, row ? row.slice(0, 5) : '[]');
        });

    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkMonthly();
