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
        },
        timeout: 15000
    });
    return response.data;
}

async function test() {
    try {
        console.log('--- Testing DragMetDynamicXML (Gold) ---');
        const now = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);

        const paramsMet = `
            <web:fromDate>${weekAgo.toISOString()}</web:fromDate>
            <web:ToDate>${now.toISOString()}</web:ToDate>
        `;
        const xmlMet = await soapRequest('DragMetDynamicXML', paramsMet);
        const resMet = await parseStringPromise(xmlMet, { explicitArray: false });
        const metals = resMet['soap:Envelope']['soap:Body'].DragMetDynamicXMLResponse.DragMetDynamicXMLResult.DragMet;
        console.log('Metals latest:', Array.isArray(metals) ? metals[metals.length - 1] : metals);

        console.log('\n--- Testing GetCursOnDateXML (USD/EUR) ---');
        const paramsCurs = `
            <web:On_date>${now.toISOString()}</web:On_date>
        `;
        const xmlCurs = await soapRequest('GetCursOnDateXML', paramsCurs);
        const resCurs = await parseStringPromise(xmlCurs, { explicitArray: false });
        const valutes = resCurs['soap:Envelope']['soap:Body'].GetCursOnDateXMLResponse.GetCursOnDateXMLResult.ValuteData.ValuteCursOnDate;
        const usd = valutes.find(v => v.VchCode === 'USD');
        const eur = valutes.find(v => v.VchCode === 'EUR');
        console.log('USD:', usd);
        console.log('EUR:', eur);

        console.log('\n--- Checking AllDataInfoXML for any other inflation fields ---');
        const xmlAll = await soapRequest('AllDataInfoXML');
        console.log('AllDataInfoXML length:', xmlAll.length);
        if (xmlAll.includes('Inflation')) {
            console.log('Found Inflation in AllDataInfoXML');
            // Extract all occurrences of Inflation tag
            const matches = xmlAll.match(/<Inflation\s+[^>]*\/>/gi);
            console.log('Inflation tags:', matches);
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) console.log('Response body:', error.response.data);
    }
}

test();
