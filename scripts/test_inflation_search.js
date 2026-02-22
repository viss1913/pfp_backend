const axios = require('axios');
const { parseStringPromise } = require('xml2js');

const SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';

async function soapRequest(method, params = '') {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://web.cbr.ru/">
  <soap:Body>
    <web:${method}>
      ${params}
    </web:${method}>
  </soap:Body>
</soap:Envelope>`;
    const response = await axios.post(SOAP_URL, body, {
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': `http://web.cbr.ru/${method}`
        }
    });
    return response.data;
}

async function test() {
    try {
        console.log('--- AllDataInfoXML Глубокий поиск ---');
        const xml = await soapRequest('AllDataInfoXML');

        // Ищем все упоминания цифр, которые могут быть инфляцией (например 0.1, 0.2, 1.2)
        // и смотрим контекст вокруг них.
        const regex = /<Inflation[^>]*>/gi;
        console.log('Inflation tags:', xml.match(regex));

        console.log('\n--- Проверка металлов (всех) ---');
        const now = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 10);
        const paramsBase = `<web:fromDate>${weekAgo.toISOString().split('T')[0]}</web:fromDate><web:ToDate>${now.toISOString().split('T')[0]}</web:ToDate>`;
        const metXml = await soapRequest('DragMetDynamicXML', paramsBase);
        const metRes = await parseStringPromise(metXml, { explicitArray: false });
        const metData = metRes['soap:Envelope']['soap:Body'].DragMetDynamicXMLResponse.DragMetDynamicXMLResult.DragMetData;
        if (metData && metData.DragMet) {
            const arr = Array.isArray(metData.DragMet) ? metData.DragMet : [metData.DragMet];
            console.log('Available metals Vcodes:', [...new Set(arr.map(m => m.Vcode || m.$.Vcode))]);
        }

        console.log('\n--- Скрейпинг страницы аналитики инфляции ---');
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        const response = await axios.get('https://www.cbr.ru/analytics/dkp/dinamic/', { headers });
        const html = response.data;

        // Ищем числа типа 0,15 или 0.15 в контексте "инфляция за неделю"
        const weekSearch = html.match(/инфляц[^<]{1,50}недел[^<]{1,100}/gi);
        if (weekSearch) {
            console.log('Found weekly inflation mentions:');
            weekSearch.forEach(m => console.log(' - ' + m.replace(/\s+/g, ' ').trim()));
        }

        const monthSearch = html.match(/инфляц[^<]{1,50}месяц[^<]{1,100}/gi);
        if (monthSearch) {
            console.log('Found monthly inflation mentions:');
            monthSearch.forEach(m => console.log(' - ' + m.replace(/\s+/g, ' ').trim()));
        }

    } catch (e) { console.error(e.message); }
}
test();
