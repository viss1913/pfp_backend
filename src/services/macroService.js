const axios = require('axios');
const db = require('../config/database');
const { parseStringPromise } = require('xml2js');

const CBR_SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';

/**
 * Сервис для сбора и хранения макроэкономических данных
 * 
 * Источники:
 *  - MOEX ISS JSON API (IMOEX, ОФЗ, корп. облигации)
 *  - CBR SOAP DailyInfo.asmx (ключевая ставка, инфляция)
 *  - CBR HTML /statistics/avgprocstav/ (макс. ставка по вкладам)
 */
class MacroService {
    constructor() {
        this.commonHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        };
    }

    // ────────────────────────────────────────────────────────────
    //  Общие хелперы
    // ────────────────────────────────────────────────────────────

    /**
     * Сохраняет значение показателя в БД (upsert по дате)
     */
    async saveIndicatorValue(slug, value, date, rawJson = null) {
        if (value === null || value === undefined || isNaN(value)) {
            console.error(`❌ Cannot save null/NaN value for ${slug}`);
            return;
        }

        try {
            const indicator = await db('macro_indicators').where({ slug }).first();
            if (!indicator) {
                console.error(`Indicator with slug "${slug}" not found`);
                return;
            }

            const formattedDate = new Date(date).toISOString().split('T')[0];

            // Проверяем существование записи
            const existing = await db('macro_data')
                .where({ indicator_id: indicator.id, date: formattedDate })
                .first();

            if (existing) {
                await db('macro_data')
                    .where({ id: existing.id })
                    .update({
                        value,
                        raw_json: rawJson ? JSON.stringify(rawJson) : null,
                        created_at: db.fn.now()
                    });
            } else {
                await db('macro_data').insert({
                    indicator_id: indicator.id,
                    value,
                    date: formattedDate,
                    raw_json: rawJson ? JSON.stringify(rawJson) : null
                });
            }

            console.log(`✅ Saved ${slug}: ${value} for ${formattedDate}`);
        } catch (error) {
            console.error(`Error saving macro data for ${slug}:`, error.message);
        }
    }

    /**
     * SOAP-запрос к ЦБР DailyInfo.asmx
     */
    async soapRequest(method, params = '') {
        const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://web.cbr.ru/">
  <soap:Body>
    <web:${method}>
      ${params}
    </web:${method}>
  </soap:Body>
</soap:Envelope>`;

        const response = await axios.post(CBR_SOAP_URL, body, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': `http://web.cbr.ru/${method}`
            },
            timeout: 15000
        });

        return response.data;
    }

    /**
     * Универсальный помощник для поиска значения в JSON MOEX
     */
    findMoexValue(data, tableName, columnName, filterColumn = null, filterValue = null) {
        if (!data[tableName]) return null;
        const table = data[tableName];
        const colIndex = table.columns.indexOf(columnName);
        if (colIndex === -1) return null;

        let row;
        if (filterColumn && filterValue) {
            const filterIndex = table.columns.indexOf(filterColumn);
            row = table.data.find(r => r[filterIndex] === filterValue);
        } else {
            row = table.data[0];
        }

        return row ? row[colIndex] : null;
    }

    // ────────────────────────────────────────────────────────────
    //  ЦБР: Ключевая ставка (SOAP KeyRateXML)
    // ────────────────────────────────────────────────────────────

    async fetchCbrKeyRate() {
        try {
            console.log('📡 Fetching CBR Key Rate (SOAP)...');
            const from = new Date();
            from.setMonth(from.getMonth() - 3);
            const to = new Date();

            const rawXml = await this.soapRequest('KeyRateXML', `
                <web:fromDate>${from.toISOString()}</web:fromDate>
                <web:ToDate>${to.toISOString()}</web:ToDate>
            `);

            const result = await parseStringPromise(rawXml, { explicitArray: false });
            const body = result['soap:Envelope']['soap:Body'];
            const krData = body.KeyRateXMLResponse.KeyRateXMLResult.KeyRate;

            let rates = krData.KR;
            if (!Array.isArray(rates)) rates = [rates];

            if (rates.length > 0) {
                // Первый элемент — самая свежая ставка
                const latest = rates[0];
                const date = new Date(latest.DT);
                const value = parseFloat(latest.Rate);
                await this.saveIndicatorValue('cbr_key_rate', value, date, { rates: rates.slice(0, 5) });
            }
        } catch (error) {
            console.error('fetchCbrKeyRate error:', error.message);
        }
    }

    /**
     * Получить котировки драгметаллов (Золото)
     */
    async fetchCbrGold() {
        console.log('📡 Fetching CBR Gold Price (SOAP)...');
        try {
            const now = new Date();
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 14);

            const params = `
                <web:fromDate>${weekAgo.toISOString().split('T')[0]}</web:fromDate>
                <web:ToDate>${now.toISOString().split('T')[0]}</web:ToDate>
            `;

            const rawXml = await this.soapRequest('DragMetDynamicXML', params);
            const result = await parseStringPromise(rawXml, { explicitArray: false });

            const metalsData = result['soap:Envelope']['soap:Body'].DragMetDynamicXMLResponse.DragMetDynamicXMLResult.DragMetData;
            if (!metalsData || !metalsData.DragMet) {
                console.error('❌ No gold data found in CBR response');
                return;
            }

            const metalsArray = Array.isArray(metalsData.DragMet) ? metalsData.DragMet : [metalsData.DragMet];
            const gold = metalsArray.find(m => m.Vcode === '1' || m.$.Vcode === '1');

            if (gold) {
                const valueAttr = gold.Vbuy || gold.$.Vbuy;
                const dateAttr = gold.OnDate || gold.$.OnDate;
                const value = parseFloat(valueAttr.replace(',', '.'));
                const date = new Date(dateAttr);

                await this.saveIndicatorValue('cbr_gold_price', value, date, gold);
            }
        } catch (error) {
            console.error('❌ Error fetching CBR Gold:', error.message);
        }
    }

    /**
     * Получить курсы валют (USD, EUR)
     */
    async fetchCbrCurrencyRates() {
        console.log('📡 Fetching CBR Currency Rates (SOAP)...');
        try {
            const now = new Date();
            const params = `<web:On_date>${now.toISOString().split('T')[0]}</web:On_date>`;

            const rawXml = await this.soapRequest('GetCursOnDateXML', params);
            const result = await parseStringPromise(rawXml, { explicitArray: false });

            const valuteData = result['soap:Envelope']['soap:Body'].GetCursOnDateXMLResponse.GetCursOnDateXMLResult.ValuteData;
            if (!valuteData || !valuteData.ValuteCursOnDate) {
                console.error('❌ No currency data found');
                return;
            }

            const valutes = Array.isArray(valuteData.ValuteCursOnDate) ? valuteData.ValuteCursOnDate : [valuteData.ValuteCursOnDate];
            const usd = valutes.find(v => v.VchCode === 'USD');
            const eur = valutes.find(v => v.VchCode === 'EUR');

            if (usd) {
                const value = parseFloat(usd.Vcurs.replace(',', '.'));
                await this.saveIndicatorValue('usd_rub', value, now, usd);
            }

            if (eur) {
                const value = parseFloat(eur.Vcurs.replace(',', '.'));
                await this.saveIndicatorValue('eur_rub', value, now, eur);
            }
        } catch (error) {
            console.error('❌ Error fetching CBR Currency Rates:', error.message);
        }
    }

    /**
     * Получить текущую годовую инфляцию (SOAP)
     */
    async fetchCbrInflation() {
        console.log('📡 Fetching CBR Inflation (SOAP)...');
        try {
            const rawXml = await this.soapRequest('MainInfoXML');
            const result = await parseStringPromise(rawXml, { explicitArray: false });

            const mainInfo = result['soap:Envelope']['soap:Body'].MainInfoXMLResponse.MainInfoXMLResult;
            const value = parseFloat(mainInfo.Inflation.replace(',', '.'));
            const date = new Date(mainInfo.InflationDate);

            await this.saveIndicatorValue('cbr_inflation_annual', value, date, mainInfo);
        } catch (error) {
            console.error('❌ Error fetching CBR Inflation:', error.message);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  ЦБР: Макс. ставка по вкладам (HTML scraping)
    // ────────────────────────────────────────────────────────────

    async fetchCbrDepositRates() {
        try {
            console.log('📡 Fetching CBR Deposit Rates (HTML)...');
            const response = await axios.get('https://www.cbr.ru/statistics/avgprocstav/', {
                headers: {
                    ...this.commonHeaders,
                    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                },
                timeout: 15000
            });

            const html = response.data;
            const tableMatch = html.match(/<table[^>]*class="data"[^>]*>([\s\S]*?)<\/table>/i);
            if (!tableMatch) {
                console.error('Could not find data table on avgprocstav page');
                return;
            }

            const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
            if (!rows || rows.length < 2) {
                console.error('No data rows found');
                return;
            }

            // Первая строка с данными (пропускаем заголовок)
            for (const row of rows) {
                const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                if (!cells || cells.length < 2) continue;

                const period = cells[0].replace(/<[^>]+>/g, '').trim();  // "I.02.2026"
                const rateStr = cells[1].replace(/<[^>]+>/g, '').trim(); // "14,4890"

                if (!period || !rateStr) continue;

                const value = parseFloat(rateStr.replace(',', '.'));
                const date = this.parseDecadeDate(period);
                if (date && !isNaN(value)) {
                    await this.saveIndicatorValue('cbr_deposit_rate_max', value, date, { period, rate: rateStr });
                    break; // Берём только последнюю (первую в таблице) запись
                }
            }
        } catch (error) {
            console.error('fetchCbrDepositRates error:', error.message);
        }
    }

    /**
     * Парсит декадную дату ЦБР: "I.02.2026" → Date
     * I = 1-е число, II = 11-е, III = 21-е
     */
    parseDecadeDate(period) {
        const match = period.match(/^(I{1,3})\.(\d{2})\.(\d{4})$/);
        if (!match) return null;

        const decade = match[1];
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);

        let day;
        switch (decade) {
            case 'I': day = 1; break;
            case 'II': day = 11; break;
            case 'III': day = 21; break;
            default: return null;
        }

        return new Date(year, month - 1, day);
    }

    // ────────────────────────────────────────────────────────────
    //  MOEX: Индекс ММВБ (IMOEX)
    // ────────────────────────────────────────────────────────────

    async syncImoex() {
        const url = 'https://iss.moex.com/iss/engines/stock/markets/index/securities/IMOEX.json?iss.meta=off&iss.only=marketdata';
        try {
            const response = await axios.get(url);
            const value = this.findMoexValue(response.data, 'marketdata', 'CURRENTVALUE', 'SECID', 'IMOEX')
                || this.findMoexValue(response.data, 'marketdata', 'LASTVALUE', 'SECID', 'IMOEX');

            if (value) {
                await this.saveIndicatorValue('moex_imoex', value, new Date(), response.data);
            } else {
                console.error('Could not find market value for IMOEX');
            }
        } catch (error) {
            console.error('syncImoex error:', error.message);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  MOEX: G-кривая ОФЗ (доходности 2, 5, 10 лет)
    // ────────────────────────────────────────────────────────────

    async syncOfzYields() {
        const url = 'https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off';
        try {
            const response = await axios.get(url);
            const data = response.data;
            if (!data.params || !data.params.data || data.params.data.length === 0) {
                console.error('No yieldcurve params in MOEX response');
                return;
            }

            const table = data.securities;
            const expDateIdx = table.columns.indexOf('expdate');
            const yieldIdx = table.columns.indexOf('clcyield');
            const now = new Date();

            const getYieldForTerm = (years) => {
                const targetDate = new Date();
                targetDate.setFullYear(now.getFullYear() + years);

                let bestBond = null;
                let minDiff = Infinity;
                table.data.forEach(row => {
                    const expDate = new Date(row[expDateIdx]);
                    const diff = Math.abs(expDate - targetDate);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestBond = row;
                    }
                });

                return bestBond ? bestBond[yieldIdx] : null;
            };

            const y2 = getYieldForTerm(2);
            if (y2) await this.saveIndicatorValue('moex_ofz_gcurve_2y', y2, new Date(), data);
            const y5 = getYieldForTerm(5);
            if (y5) await this.saveIndicatorValue('moex_ofz_gcurve_5y', y5, new Date(), data);
            const y10 = getYieldForTerm(10);
            if (y10) await this.saveIndicatorValue('moex_ofz_gcurve_10y', y10, new Date(), data);

        } catch (error) {
            console.error('syncOfzYields error:', error.message);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  MOEX: Индекс корп. облигаций (RUCBICP)
    // ────────────────────────────────────────────────────────────

    async syncCorpBonds() {
        const url = 'https://iss.moex.com/iss/engines/stock/markets/index/securities/RUCBICP.json?iss.meta=off&iss.only=marketdata';
        try {
            const response = await axios.get(url);
            const value = this.findMoexValue(response.data, 'marketdata', 'CURRENTVALUE', 'SECID', 'RUCBICP')
                || this.findMoexValue(response.data, 'marketdata', 'LASTVALUE', 'SECID', 'RUCBICP');

            if (value) {
                await this.saveIndicatorValue('moex_rucbicp', value, new Date(), response.data);
            } else {
                console.error('Could not find market value for RUCBICP');
            }
        } catch (error) {
            console.error('syncCorpBonds error:', error.message);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Запросы данных (API endpoints)
    // ────────────────────────────────────────────────────────────

    /**
     * Последние значения всех активных индикаторов
     */
    async getLatestValues() {
        return await db('macro_indicators as i')
            .leftJoin('macro_data as d', function () {
                this.on('i.id', '=', 'd.indicator_id')
                    .andOn('d.date', '=', db.raw('(SELECT MAX(date) FROM macro_data WHERE indicator_id = i.id)'));
            })
            .where('i.is_active', true)
            .select('i.slug', 'i.name', 'i.unit', 'd.value', 'd.date');
    }

    /**
     * История значений конкретного показателя
     */
    async getHistory(slug, from, to) {
        const indicator = await db('macro_indicators').where({ slug }).first();
        if (!indicator) return null;

        let query = db('macro_data')
            .where({ indicator_id: indicator.id })
            .orderBy('date', 'asc');

        if (from) query = query.where('date', '>=', from);
        if (to) query = query.where('date', '<=', to);

        return await query;
    }
}

module.exports = new MacroService();
