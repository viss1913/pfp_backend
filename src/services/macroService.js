const axios = require('axios');
const XLSX = require('xlsx');
const db = require('../config/database');
const { parseStringPromise } = require('xml2js');

const CBR_SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
/** UniDbQuery «Инфляция и ключевая ставка» — колонка «Инфляция, % г/г» */
const CBR_INFLATION_YOY_QUERY_ID = '132934';
const CBR_INFLATION_YOY_SLUG = 'russia_cpi_inflation_yoy';
const CBR_INFLATION_YOY_HISTORY_YEARS = 12;
const CBR_KEY_RATE_HISTORY_YEARS = 12;

function lastDayOfMonthUtc(year, month1to12) {
    return new Date(Date.UTC(year, month1to12, 0, 12, 0, 0));
}

function formatCbrUniDbQueryDate(d) {
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function parseCbrMonthPeriod(period) {
    const m = /^(\d{2})\.(\d{4})$/.exec(String(period).trim());
    if (!m) return null;
    const mm = parseInt(m[1], 10);
    const yyyy = parseInt(m[2], 10);
    if (mm < 1 || mm > 12) return null;
    return lastDayOfMonthUtc(yyyy, mm);
}

/** Логирует детали ошибки запроса (статус, тело ответа) */
function logFetchError(context, err, responseBody = null) {
    const msg = err.response
        ? `status ${err.response.status}, body: ${String(responseBody || err.response.data || '').slice(0, 400)}`
        : err.message;
    console.error(`[macro] ${context}: ${msg}`);
    if (err.response && err.response.status) {
        console.error(`[macro] ${context} response status:`, err.response.status);
    }
}

/**
 * Сервис для сбора и хранения макроэкономических данных
 * 
 * Источники:
 *  - MOEX ISS JSON API (IMOEX, ОФЗ, корп. облигации)
 *  - CBR SOAP DailyInfo.asmx (ключевая ставка)
 *  - CBR UniDbQuery Excel 132934 (ИПЦ г/г → russia_cpi_inflation_yoy)
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

        try {
            const response = await axios.post(CBR_SOAP_URL, body, {
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': `http://web.cbr.ru/${method}`
                },
                timeout: 15000
            });
            return response.data;
        } catch (err) {
            const snippet = typeof err.response?.data === 'string' ? err.response.data.slice(0, 500) : JSON.stringify(err.response?.data);
            logFetchError(`SOAP ${method}`, err, snippet);
            throw err;
        }
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

    async fetchCbrKeyRate({ from = null, to = null } = {}) {
        try {
            console.log('📡 Fetching CBR Key Rate (SOAP)...');
            const fromDate = from instanceof Date ? from : new Date();
            if (!(from instanceof Date)) {
                fromDate.setFullYear(fromDate.getFullYear() - CBR_KEY_RATE_HISTORY_YEARS);
            }
            const toDate = to instanceof Date ? to : new Date();

            const rawXml = await this.soapRequest('KeyRateXML', `
                <web:fromDate>${fromDate.toISOString()}</web:fromDate>
                <web:ToDate>${toDate.toISOString()}</web:ToDate>
            `);

            const result = await parseStringPromise(rawXml, { explicitArray: false });
            const body = result?.['soap:Envelope']?.['soap:Body'];
            const krData = body?.KeyRateXMLResponse?.KeyRateXMLResult?.KeyRate;
            if (!krData || !krData.KR) {
                console.warn('[macro] CBR Key Rate: пустой ответ KeyRateXML');
                return { saved: 0 };
            }

            let rates = krData.KR;
            if (!Array.isArray(rates)) rates = [rates];
            let saved = 0;

            for (const rate of rates) {
                const date = new Date(rate?.DT);
                const value = parseFloat(rate?.Rate);
                if (Number.isNaN(date.getTime()) || !Number.isFinite(value)) {
                    continue;
                }
                await this.saveIndicatorValue('cbr_key_rate', value, date, rate);
                saved += 1;
            }
            console.log(`✅ Saved ${saved} CBR key rate point(s)`);
            return { saved };
        } catch (error) {
            logFetchError('fetchCbrKeyRate', error);
            return { saved: 0 };
        }
    }

    /**
     * Получить котировки драгметаллов (Золото)
     */
    async fetchCbrGold() {
        await this.fetchCbrGoldHistory();
    }

    /**
     * Получить котировки драгметаллов (Золото) за период
     */
    async fetchCbrGoldHistory(from = null, to = null) {
        if (!from) {
            from = new Date();
            from.setDate(from.getDate() - 14);
        }
        if (!to) to = new Date();

        const formatDate = (d) => {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${day}/${month}/${d.getFullYear()}`;
        };

        const url = `https://www.cbr.ru/scripts/xml_metall.asp?date_req1=${formatDate(from)}&date_req2=${formatDate(to)}`;
        console.log(`📡 Fetching CBR Gold Price History (XML API): ${url}`);

        try {
            const response = await axios.get(url, { timeout: 15000, headers: this.commonHeaders });
            const result = await parseStringPromise(response.data, { explicitArray: false });

            if (!result.Metadata || !result.Metadata.Record) {
                console.warn('[macro] CBR Gold: нет Metadata.Record. Ключи ответа:', result ? Object.keys(result) : 'null');
                return;
            }

            let records = result.Metadata.Record;
            if (!Array.isArray(records)) records = [records];

            // Фильтруем только золото (Code 1)
            const goldRecords = records.filter(r => r && r.$ && r.$.Code === '1');
            if (goldRecords.length === 0) {
                console.warn('[macro] CBR Gold: записей с Code=1 нет. Всего записей:', records.length, 'пример Code:', records[0]?.$?.Code);
                return;
            }

            for (const rec of goldRecords) {
                const dateParts = rec.$.Date.split('.');
                const date = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
                const value = parseFloat(rec.Buy.replace(',', '.'));
                await this.saveIndicatorValue('cbr_gold_price', value, date, rec);
            }
        } catch (error) {
            logFetchError('CBR Gold', error, error.response?.data != null ? String(error.response.data).slice(0, 400) : null);
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

            const body = result['soap:Envelope']?.['soap:Body'];
            const valuteData = body?.GetCursOnDateXMLResponse?.GetCursOnDateXMLResult?.ValuteData;
            if (!valuteData || !valuteData.ValuteCursOnDate) {
                console.warn('[macro] CBR Currency: нет ValuteData. Ключи body:', body ? Object.keys(body) : 'null');
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
            logFetchError('CBR Currency', error);
        }
    }

    /**
     * ИПЦ г/г из Excel UniDbQuery ЦБ (отчёты, /macro/latest → inflation_yoy).
     * https://www.cbr.ru/hd_base/infl/
     */
    async fetchCbrInflationYoyExcel() {
        const to = new Date();
        const from = new Date();
        from.setFullYear(from.getFullYear() - CBR_INFLATION_YOY_HISTORY_YEARS);

        const qs = new URLSearchParams({
            FromDate: formatCbrUniDbQueryDate(from),
            ToDate: formatCbrUniDbQueryDate(to),
            posted: 'False',
        });
        const url = `https://www.cbr.ru/Queries/UniDbQuery/DownloadExcel/${CBR_INFLATION_YOY_QUERY_ID}?${qs}`;

        console.log(`📡 Fetching CBR inflation YoY (Excel ${CBR_INFLATION_YOY_QUERY_ID})...`);

        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    ...this.commonHeaders,
                    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
                },
            });

            const workbook = XLSX.read(response.data, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                console.warn('[macro] CBR inflation YoY Excel: нет листов');
                return { saved: 0 };
            }

            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
            if (rows.length < 2) {
                console.warn('[macro] CBR inflation YoY Excel: мало строк');
                return { saved: 0 };
            }

            const header = rows[0].map((c) => String(c).trim());
            let colDate = header.findIndex((h) => /^дата$/i.test(h));
            let colYoy = header.findIndex((h) => /инфляц/i.test(h) && /г\s*\/\s*г/i.test(h));
            if (colDate < 0) colDate = 0;
            if (colYoy < 0) colYoy = 2;

            let saved = 0;
            let latest = null;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row[colDate] === '' || row[colDate] == null) continue;

                const date = parseCbrMonthPeriod(row[colDate]);
                if (!date) continue;

                const value = parseFloat(String(row[colYoy]).replace(',', '.'));
                if (Number.isNaN(value)) continue;

                const period = String(row[colDate]).trim();
                await this.saveIndicatorValue(CBR_INFLATION_YOY_SLUG, value, date, {
                    source: `cbr_unidbquery_${CBR_INFLATION_YOY_QUERY_ID}`,
                    period,
                });
                saved += 1;
                // ЦБ отдаёт строки от нового месяца к старым — первая валидная строка = последняя публикация
                if (!latest) {
                    latest = {
                        period,
                        value,
                        date: date.toISOString().split('T')[0],
                    };
                }
            }

            console.log(`✅ CBR inflation YoY: ${saved} points → ${CBR_INFLATION_YOY_SLUG}`);
            return { saved, latest };
        } catch (error) {
            logFetchError('fetchCbrInflationYoyExcel', error);
            throw error;
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

            const body = result['soap:Envelope']?.['soap:Body'];
            const mainInfo = body?.MainInfoXMLResponse?.MainInfoXMLResult;

            if (!mainInfo || mainInfo.Inflation === undefined) {
                console.warn('[macro] CBR Inflation: нет MainInfoXMLResult.Inflation. Ключи mainInfo:', mainInfo ? Object.keys(mainInfo) : 'null');
                return;
            }

            const value = parseFloat(String(mainInfo.Inflation).replace(',', '.'));
            const date = new Date(mainInfo.InflationDate);

            await this.saveIndicatorValue('cbr_inflation_annual', value, date, mainInfo);
        } catch (error) {
            logFetchError('CBR Inflation', error);
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
                console.warn('[macro] CBR Deposit: таблица .data не найдена. Длина HTML:', html?.length, 'фрагмент:', html?.slice(0, 300));
                return;
            }

            const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
            if (!rows || rows.length < 2) {
                console.warn('[macro] CBR Deposit: строк в таблице нет или одна. rows.length:', rows?.length ?? 0);
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
            logFetchError('CBR Deposit', error, error.response?.data != null ? String(error.response.data).slice(0, 400) : null);
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
            logFetchError('syncImoex', error);
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
                console.warn('[macro] MOEX OFZ: нет params.data. Ключи ответа:', Object.keys(data || {}));
                return;
            }

            const table = data.securities;
            if (!table || !table.columns || !table.data?.length) {
                console.warn('[macro] MOEX OFZ: нет securities.columns/data');
                return;
            }
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
            logFetchError('syncOfzYields', error);
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
            logFetchError('syncCorpBonds', error);
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
