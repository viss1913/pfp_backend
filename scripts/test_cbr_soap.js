const axios = require('axios');
const { parseStringPromise } = require('xml2js');

const SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';

async function soapRequest(method, params, action) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://web.cbr.ru/">
  <soap:Body>
    <web:${method}>
      ${params}
    </web:${method}>
  </soap:Body>
</soap:Envelope>`;

    const r = await axios.post(SOAP_URL, body, {
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': `http://web.cbr.ru/${method}`
        },
        timeout: 15000
    });
    return r.data;
}

async function test() {
    // 1. MainInfoXML - might have inflation and key rate
    console.log('=== MainInfoXML ===');
    try {
        const data = await soapRequest('MainInfoXML', '');
        console.log(typeof data === 'string' ? data.substring(0, 1000) : JSON.stringify(data).substring(0, 1000));
    } catch (e) { console.error('MainInfoXML Error:', e.message); }

    // 2. DepRate - deposit rates
    console.log('\n=== DepDynamicXML (Deposit rates) ===');
    try {
        const data = await soapRequest('DepDynamicXML', `
      <web:fromDate>2026-01-01</web:fromDate>
      <web:ToDate>2026-02-22</web:ToDate>
        `);
        console.log(typeof data === 'string' ? data.substring(0, 1000) : JSON.stringify(data).substring(0, 1000));
    } catch (e) { console.error('DepDynamicXML Error:', e.message); }

    // 3. Try Inflation
    console.log('\n=== Inflation ===');
    try {
        const data = await soapRequest('AllDataInfoXML', '');
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        // Search for inflation-related parts
        const idx = str.toLowerCase().indexOf('infl');
        if (idx > -1) {
            console.log('Found inflation at index', idx);
            console.log(str.substring(Math.max(0, idx - 100), idx + 500));
        } else {
            console.log('No inflation data found in AllDataInfoXML');
            console.log(str.substring(0, 800));
        }
    } catch (e) { console.error('AllDataInfoXML Error:', e.message); }

    // 4. DragMetDynamic - for reference
    console.log('\n=== Ruonia ===');
    try {
        const data = await soapRequest('RuoniaXML', `
      <web:fromDate>2026-02-01</web:fromDate>
      <web:ToDate>2026-02-22</web:ToDate>
        `);
        console.log(typeof data === 'string' ? data.substring(0, 600) : JSON.stringify(data).substring(0, 600));
    } catch (e) { console.error('RuoniaXML Error:', e.message); }
}

test();
