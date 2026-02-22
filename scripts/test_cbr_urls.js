const axios = require('axios');

async function testCbrUrls() {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9'
    };

    const urls = [
        // SOAP service
        'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx',
        // Old XML (without www)
        'https://cbr.ru/scripts/XML_daily.asp',
        // Old XML key rate
        'https://www.cbr.ru/scripts/XML_key_rate.asp',
        // Statistics page 
        'https://www.cbr.ru/hd_base/KeyRate/',
        // Open data API
        'https://www.cbr.ru/Queries/UniDbQuery/DownloadExcel/132956?Posted=True&mode=1&VAL_NM_RQ=R_INFL',
        // New API format
        'https://www.cbr.ru/statistics/avgprocstav/',
        // DailyInfo WSDL
        'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx?WSDL',
    ];

    for (const url of urls) {
        try {
            const r = await axios.get(url, {
                headers,
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: () => true,
                responseType: 'arraybuffer'
            });
            const txt = Buffer.from(r.data).toString('utf8');
            const shortUrl = url.length > 80 ? url.substring(0, 80) + '...' : url;
            console.log(`\n=== ${shortUrl} ===`);
            console.log('Status:', r.status);
            console.log('Content-Type:', r.headers['content-type']);
            console.log('Body (300 chars):', txt.substring(0, 300));
        } catch (e) {
            console.error(`\n=== ${url.substring(0, 80)} === ERROR:`, e.message);
        }
    }
}

testCbrUrls();
