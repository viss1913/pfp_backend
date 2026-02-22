const axios = require('axios');
const https = require('https');
const XLSX = require('xlsx');

async function testRosstatXlsx() {
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
        const sheetName = '2026';
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        console.log('--- Searching for total index row in all 300+ rows ---');
        let totalRow = null;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const firstCell = (row[0] || '').toString().trim().toLowerCase();
            // In Rosstat files, the total IPC is often "Индекс потребительских цен" or starts with it
            if (firstCell.includes('индекс потребительских цен') ||
                firstCell === 'всего' ||
                firstCell.includes('все товары и услуги')) {
                totalRow = { index: i, name: row[0], data: row };
                console.log(`🎯 Found candidate at row ${i}: "${row[0]}"`);
            }
        }

        if (!totalRow) {
            // If not found in col 0, check col 1 (sometimes there's an empty col)
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length < 2) continue;
                const secondCell = (row[1] || '').toString().trim().toLowerCase();
                if (secondCell.includes('индекс потребительских цен') ||
                    secondCell === 'всего' ||
                    secondCell.includes('все товары и услуги')) {
                    totalRow = { index: i, name: row[1], data: row };
                    console.log(`🎯 Found candidate at row ${i} Col 1: "${row[1]}"`);
                }
            }
        }

        if (totalRow) {
            let lastValue = null;
            let lastCol = -1;
            // Scan columns from right to left starting from col 1
            for (let j = totalRow.data.length - 1; j >= 1; j--) {
                const val = totalRow.data[j];
                if (val !== null && val !== undefined && val !== '' && !isNaN(parseFloat(val))) {
                    lastValue = parseFloat(val);
                    lastCol = j;
                    break;
                }
            }
            console.log(`--- Result: ${lastValue} at col ${lastCol}`);

            // Look for date in header rows (usually 2, 3 or 4)
            // Header usually contains "на 16 февраля" etc.
            const dateRowIdx = 3; // Based on previous output
            const dateLabel = data[dateRowIdx] ? data[dateRowIdx][lastCol] : 'Unknown';
            console.log(`--- Date label: ${dateLabel}`);
        } else {
            console.log('❌ TOTAL INDEX NOT FOUND. DUMPING LAST 10 ROWS:');
            data.slice(-10).forEach((row, i) => console.log(`Row ${data.length - 10 + i}:`, row));
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testRosstatXlsx();
