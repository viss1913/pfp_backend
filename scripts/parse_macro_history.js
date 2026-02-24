const axios = require('axios');
const XLSX = require('xlsx');
const { parseStringPromise } = require('xml2js');
const macroService = require('../src/services/macroService');
const rosstatService = require('../src/services/rosstatService');
const db = require('../src/config/database');

/**
 * Скрипт для загрузки исторической информации по макроэкономическим параметрам
 * Период: последние 5 лет
 */
async function run() {
    console.log('🚀 Starting deep historical macro data parsing...');

    const startYear = 2021;
    const now = new Date();
    const startDate = new Date(startYear, 0, 1);

    try {
        // 1. Ключевая ставка ЦБ РФ (История)
        console.log('\n--- 1. CBR Key Rate History ---');
        await fetchCbrKeyRateHistory(startDate, now);

        // 2. Средняя макс. ставка по вкладам (Excel архив)
        console.log('\n--- 2. CBR Max Deposit Rate History (Excel) ---');
        await fetchCbrDepositRateHistory();

        // 3. Индекс МосБиржи (IMOEX History)
        console.log('\n--- 3. MOEX IMOEX History ---');
        await fetchMoexHistory('IMOEX', startDate, now, 'moex_imoex');

        // 4. Индекс корп. облигаций (RUCBICP History)
        console.log('\n--- 4. MOEX RUCBICP History ---');
        await fetchMoexHistory('RUCBICP', startDate, now, 'moex_rucbicp');

        // 5. Золото (CBR History)
        console.log('\n--- 5. CBR Gold Price History ---');
        await macroService.fetchCbrGoldHistory(startDate, now);

        // 6. Инфляция (Rosstat History - fallbacks / static)
        console.log('\n--- 6. Inflation History ---');
        await fetchInflationHistory();

        console.log('\n✅ Deep historical parsing completed successfully!');
    } catch (error) {
        console.error('\n❌ Critical error during historical parsing:', error.message);
    } finally {
        process.exit(0);
    }
}

async function getCount(slug) {
    const indicator = await db('macro_indicators').where({ slug }).first();
    if (!indicator) return 0;
    const res = await db('macro_data').where({ indicator_id: indicator.id }).count('id as count').first();
    return res ? res.count : 0;
}

/**
 * Загрузка истории ключевой ставки через SOAP
 */
async function fetchCbrKeyRateHistory(from, to) {
    try {
        const rawXml = await macroService.soapRequest('KeyRateXML', `
            <web:fromDate>${from.toISOString()}</web:fromDate>
            <web:ToDate>${to.toISOString()}</web:ToDate>
        `);

        const result = await parseStringPromise(rawXml, { explicitArray: false });
        const body = result['soap:Envelope']['soap:Body'];
        const krData = body.KeyRateXMLResponse.KeyRateXMLResult.KeyRate;

        if (!krData || !krData.KR) return;

        let rates = krData.KR;
        if (!Array.isArray(rates)) rates = [rates];

        for (const entry of rates) {
            const date = new Date(entry.DT);
            const value = parseFloat(entry.Rate);
            await macroService.saveIndicatorValue('cbr_key_rate', value, date);
        }
    } catch (e) {
        console.error('Error fetching key rate history:', e.message);
    }
}

/**
 * Загрузка истории ставок по вкладам из Excel-файла ЦБ
 */
async function fetchCbrDepositRateHistory() {
    // Постоянная ссылка на архивный Excel
    const excelUrl = 'https://www.cbr.ru/vfs/statistics/bank_system/avg_stav.xlsx';
    try {
        console.log(`Downloading Excel from ${excelUrl}...`);
        const response = await axios.get(excelUrl, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        console.log(`Parsing Excel rows... Total rows: ${data.length}`);
        let count = 0;
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 2) continue;

            const periodStr = row[0] ? row[0].toString().trim() : '';
            // Ищем строки вида "I декада..." или "I.02.2023" или просто дату
            const value = parseFloat(row[1] ? row[1].toString().replace(',', '.') : 'NaN');

            let date = null;
            if (periodStr.includes('декада')) {
                date = parseCbrDecadeString(periodStr);
            } else if (periodStr.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                const parts = periodStr.split('.');
                date = new Date(parts[2], parts[1] - 1, parts[0]);
            }

            if (date && !isNaN(value)) {
                await macroService.saveIndicatorValue('cbr_deposit_rate_max', value, date);
                count++;
            }
        }
        console.log(`Successfully imported ${count} deposit rate records`);
    } catch (e) {
        console.error('Error fetching deposit rate history:', e.message);
    }
}

function parseCbrDecadeString(str) {
    const months = {
        'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
        'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
    };

    const match = str.match(/(I{1,3})\s+декада\s+([а-яё]+)\s+(\d{4})/i);
    if (!match) return null;

    const decade = match[1];
    const month = months[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);

    let day = 1;
    if (decade === 'II') day = 11;
    if (decade === 'III') day = 21;

    return new Date(year, month, day);
}

/**
 * Универсальный загрузчик истории с MOEX
 */
async function fetchMoexHistory(secId, from, to, slug) {
    let start = 0;
    const limit = 100;
    let hasMore = true;

    const formatDate = (d) => d.toISOString().split('T')[0];

    while (hasMore) {
        const url = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secId}.json?from=${formatDate(from)}&till=${formatDate(to)}&start=${start}`;
        try {
            const response = await axios.get(url);
            const history = response.data.history;

            if (!history || history.data.length === 0) {
                hasMore = false;
                break;
            }

            const dateIdx = history.columns.indexOf('TRADEDATE');
            const valueIdx = history.columns.indexOf('CLOSE');

            for (const row of history.data) {
                const date = new Date(row[dateIdx]);
                const value = parseFloat(row[valueIdx]);
                if (!isNaN(value)) {
                    await macroService.saveIndicatorValue(slug, value, date);
                }
            }

            start += limit;
            if (history.data.length < limit) hasMore = false;
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.error(`Error fetching MOEX history for ${secId}:`, e.message);
            hasMore = false;
        }
    }
}

/**
 * История инфляции (статическая загрузка или API)
 */
async function fetchInflationHistory() {
    // Используем StatBureau как надежный и простой источник истории ИПЦ
    try {
        const url = 'https://www.statbureau.org/get-data-json?country=russia';
        console.log(`📡 Fetching Inflation History (StatBureau API): ${url}`);
        const response = await axios.get(url);

        // Массив объектов { Month: "/Date(1609455600000)/", InflationRateFormatted: "0.67", ... }
        for (const entry of response.data) {
            const timestamp = parseInt(entry.Month.match(/\d+/)[0]);
            const date = new Date(timestamp);

            // Нам нужна годовая инфляция (InflationRateFormatted за 12 месяцев) или месячная?
            // По умолчанию возьмем InflationRate (месячная) и InflationRateYearToDate (аккумулированная)
            const monthlyValue = parseFloat(entry.InflationRate);

            if (date.getFullYear() >= 2021) {
                await macroService.saveIndicatorValue('rosstat_inflation_monthly', monthlyValue, date, entry);
            }
        }
    } catch (e) {
        console.error('Error fetching inflation history:', e.message);
    }
}

run();
