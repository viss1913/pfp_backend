const axios = require('axios');
const https = require('https');
const XLSX = require('xlsx');

async function exhaustiveSearch() {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const headers = { 'User-Agent': 'Mozilla/5.0' };

    // 1. Проверяем месячный файл инфляции
    const monthlyUrl = 'https://rosstat.gov.ru/storage/mediabank/ipc_mes_01-2026.xlsx';
    console.log(`📡 Downloading Monthly: ${monthlyUrl}`);
    try {
        const res = await axios.get(monthlyUrl, { httpsAgent: agent, responseType: 'arraybuffer', headers });
        const wb = XLSX.read(res.data, { type: 'buffer' });
        console.log('Monthly Sheets:', wb.SheetNames);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        console.log('Monthly First 10 rows Col 0-2:');
        data.slice(0, 10).forEach(r => console.log(r ? r.slice(0, 3) : '[]'));
    } catch (e) { console.log('Monthly error:', e.message); }

    // 2. Ищем "недельную" на странице ЦБР (часто есть в HD_BASE)
    const cbrHdUrl = 'https://www.cbr.ru/hd_base/inflation/';
    console.log(`📡 Checking CBR HD Base: ${cbrHdUrl}`);
    try {
        const res = await axios.get(cbrHdUrl, { httpsAgent: agent, headers });
        const html = res.data;
        console.log('CBR Inflation Page Title:', html.match(/<title>(.*?)<\/title>/)?.[1]);
        // Ищем таблицы или ссылки на данные
        const tables = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
        console.log('Found tables:', tables ? tables.length : 0);
        if (tables) {
            console.log('First table sample:', tables[0].substring(0, 500).replace(/\s+/g, ' '));
        }
    } catch (e) { console.log('CBR HD error:', e.message); }

    // 3. Глубокий поиск в nedel_Ipc.xlsx по всем ячейкам
    const weeklyUrl = 'https://rosstat.gov.ru/storage/mediabank/nedel_Ipc.xlsx';
    console.log(`📡 Deep Search in Weekly: ${weeklyUrl}`);
    try {
        const res = await axios.get(weeklyUrl, { httpsAgent: agent, responseType: 'arraybuffer', headers });
        const wb = XLSX.read(res.data, { type: 'buffer' });
        const ws = wb.Sheets['2026'];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        let candidates = [];
        data.forEach((row, i) => {
            if (!row) return;
            row.forEach((cell, j) => {
                const s = (cell || '').toString().toLowerCase();
                if (s.includes('индекс') || s.includes('всего') || s.includes('ипц')) {
                    candidates.push({ row: i, col: j, val: cell });
                }
            });
        });
        console.log('Potential total IPC rows:', candidates.slice(0, 10));
    } catch (e) { console.log('Weekly error:', e.message); }
}

exhaustiveSearch();
