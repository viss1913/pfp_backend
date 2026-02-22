const axios = require('axios');

async function testCbrUrls() {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/xml,text/xml,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9'
    };

    const urls = [
        // Without www - key rate
        'https://cbr.ru/scripts/XML_key_rate.asp',
        // Without www - inflation
        'https://cbr.ru/scripts/XML_inflation.asp',
        // Without www - deposit rates
        'https://cbr.ru/scripts/XML_avg_max_rates.asp',
        // SOAP - KeyRate request
    ];

    for (const url of urls) {
        try {
            const r = await axios.get(url, {
                headers,
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: () => true,
                responseType: 'arraybuffer'
            });
            const contentType = r.headers['content-type'] || '';
            let txt;
            if (contentType.includes('windows-1251')) {
                const decoder = new TextDecoder('windows-1251');
                txt = decoder.decode(r.data);
            } else {
                txt = Buffer.from(r.data).toString('utf8');
            }
            console.log(`\n=== ${url} ===`);
            console.log('Status:', r.status);
            console.log('Content-Type:', contentType);
            console.log('Body (500 chars):', txt.substring(0, 500));
        } catch (e) {
            console.error(`\n=== ${url} === ERROR:`, e.message);
        }
    }

    // Test SOAP for KeyRate
    try {
        console.log('\n=== SOAP KeyRate ===');
        const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://web.cbr.ru/">
  <soap:Body>
    <web:KeyRateXML>
      <web:fromDate>2026-01-01</web:fromDate>
      <web:ToDate>2026-02-22</web:ToDate>
    </web:KeyRateXML>
  </soap:Body>
</soap:Envelope>`;
        const r = await axios.post('https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx', soapBody, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://web.cbr.ru/KeyRateXML'
            },
            timeout: 15000,
            validateStatus: () => true,
        });
        console.log('Status:', r.status);
        console.log('Body (500 chars):', (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).substring(0, 500));
    } catch (e) {
        console.error('SOAP Error:', e.message);
    }
}

testCbrUrls();
