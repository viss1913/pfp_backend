const axios = require('axios');
const https = require('https');
const XLSX = require('xlsx');

async function scanWeeklyXlsx() {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = 'https://rosstat.gov.ru/storage/mediabank/nedel_Ipc.xlsx';

    console.log(`📡 Downloading: ${url}`);
    try {
        const response = await axios.get(url, {
            httpsAgent: agent,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const ws = workbook.Sheets['2026'];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        console.log('--- Scanning all row titles ---');
        data.forEach((row, i) => {
            if (row && row[0]) {
                const title = row[0].toString().trim();
                // Check if it's the total index
                if (title.toLowerCase().includes('индекс') || title.toLowerCase().includes('всего') || title.toLowerCase().includes('ипц')) {
                    console.log(`🎯 ROW ${i}: "${title}" -> ${row.slice(1, 5).join(' | ')}`);
                }
            } else if (row && row[1]) {
                const title = row[1].toString().trim();
                if (title.toLowerCase().includes('индекс') || title.toLowerCase().includes('всего') || title.toLowerCase().includes('ипц')) {
                    console.log(`🎯 ROW ${i} (Col 1): "${title}" -> ${row.slice(2, 6).join(' | ')}`);
                }
            }
        });

        // If still not found, check if it's at the end of the file
        console.log('--- End of file check ---');
        data.slice(-5).forEach((row, i) => {
            console.log(`Last Row ${data.length - 5 + i}:`, row ? row.slice(0, 5) : '[]');
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

scanWeeklyXlsx();
