const axios = require('axios');
const https = require('https');
const XLSX = require('xlsx');
const db = require('../config/database');

/**
 * Расширение для MacroService для работы с данными Росстата
 */
class RosstatService {
    constructor() {
        this.commonHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        };
        this.agent = new https.Agent({ rejectUnauthorized: false });
    }

    async fetchMonthlyInflation() {
        console.log('📡 Fetching Rosstat Monthly Inflation...');
        try {
            // 1. Находим ссылку на актуальный файл ipc_spr (справочная информация об ИПЦ)
            const pageRes = await axios.get('https://rosstat.gov.ru/statistics/price', {
                httpsAgent: this.agent,
                headers: this.commonHeaders
            });
            const html = pageRes.data;
            // Ищем что-то вроде /storage/mediabank/ipc_spr_01-2026.xlsx
            const match = html.match(/\/storage\/mediabank\/ipc_spr_(\d{2})-(\d{4})\.xlsx/);
            if (!match) {
                console.error('❌ Could not find ipc_spr XLSX link');
                return;
            }

            const fileUrl = `https://rosstat.gov.ru${match[0]}`;
            const month = match[1];
            const year = match[2];
            console.log(`📡 Downloading: ${fileUrl}`);

            const res = await axios.get(fileUrl, {
                httpsAgent: this.agent,
                responseType: 'arraybuffer',
                headers: this.commonHeaders
            });

            const workbook = XLSX.read(res.data, { type: 'buffer' });
            // Лист называется MГГГГ (например 12026 для Января 2026)
            // Но мы можем найти его по шаблону
            const sheetName = workbook.SheetNames.find(s => s.endsWith(year) && s.length <= 6);
            if (!sheetName) throw new Error(`Sheet for ${year} not found`);

            const ws = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

            // Ищем "Все товары и услуги" - обычно строка 6 (index 5-7)
            const targetRow = data.find(r => r && r[0] && r[0].toString().trim() === 'Все товары и услуги');
            if (targetRow && targetRow[3]) {
                const value = parseFloat(targetRow[3]); // Индекс к предыдущему месяцу
                const date = new Date(year, parseInt(month, 10) - 1, 1);

                await this.saveIndicatorValue('rosstat_inflation_monthly', value, date, { url: fileUrl });
                console.log(`✅ Saved Monthly Inflation: ${value}% for ${sheetName}`);
            }
        } catch (error) {
            console.error('❌ Rosstat Monthly Error:', error.message);
        }
    }

    async fetchWeeklyInflation() {
        console.log('📡 Fetching Rosstat Weekly Inflation (Scraping news)...');
        try {
            const pageRes = await axios.get('https://rosstat.gov.ru/statistics/price', {
                httpsAgent: this.agent,
                headers: this.commonHeaders
            });
            const html = pageRes.data;

            // Более гибкий поиск новости и значения
            // Варианты: "составил 100,12%", "составил 0,12%", "составила 100,12%"
            const valueRegex = /составил[а]?\s+((?:100|0),\d+)%/i;
            const newsBlockRegex = /Об индексе потребительских цен с (.*?) составил/gi;

            const newsMatch = html.match(valueRegex);
            if (newsMatch) {
                let value = parseFloat(newsMatch[1].replace(',', '.'));
                // Если значение < 2, значит это процент прироста (напр. 0.12), а нам нужен индекс (100.12)
                if (value < 5) { // Порог 5% для недельной инфляции - разумно
                    value = 100 + value;
                }

                // Попытка выпарсить дату окончания периода
                const dateMatch = html.match(/по\s+(\d+)\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i);
                let date = new Date();
                if (dateMatch) {
                    const day = parseInt(dateMatch[1], 10);
                    const monthMap = { 'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11 };
                    date = new Date(parseInt(dateMatch[3], 10), monthMap[dateMatch[2].toLowerCase()], day);
                }

                await this.saveIndicatorValue('rosstat_inflation_weekly', value, date, { text: newsMatch[0] });
                console.log(`✅ Saved Weekly Inflation: ${value}% for ${date.toISOString().split('T')[0]}`);
            } else {
                console.log('⚠️ Could not find weekly inflation in news text.');
            }
        } catch (error) {
            console.error('❌ Rosstat Weekly Error:', error.message);
        }
    }

    async saveIndicatorValue(slug, value, date, rawJson = null) {
        // Мы используем существующую логику из macroService, но для простоты пока продублируем или позже вынесем
        try {
            const indicator = await db('macro_indicators').where({ slug }).first();
            if (!indicator) return;
            const formattedDate = new Date(date).toISOString().split('T')[0];
            const existing = await db('macro_data').where({ indicator_id: indicator.id, date: formattedDate }).first();
            if (existing) {
                await db('macro_data').where({ id: existing.id }).update({ value, raw_json: JSON.stringify(rawJson), created_at: db.fn.now() });
            } else {
                await db('macro_data').insert({ indicator_id: indicator.id, value, date: formattedDate, raw_json: JSON.stringify(rawJson) });
            }
        } catch (e) { console.error('Save error:', e.message); }
    }
}

module.exports = new RosstatService();
