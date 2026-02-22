const axios = require('axios');
const https = require('https');

async function test() {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    console.log('--- Fetching Rosstat Price Page ---');
    try {
        const res = await axios.get('https://rosstat.gov.ru/statistics/price', {
            httpsAgent: agent,
            headers,
            timeout: 10000
        });
        const html = res.data;
        console.log('Page title:', html.match(/<title>(.*?)<\/title>/)?.[1]);

        // Look for XLSX files related to weekly inflation
        const regex = /href=\"(.*?\.xlsx)\"/gi;
        let match;
        const xlsxFiles = [];
        while ((match = regex.exec(html)) !== null) {
            xlsxFiles.push(match[1]);
        }

        console.log('Found XLSX files:', xlsxFiles.filter(f => f.toLowerCase().includes('week') || f.toLowerCase().includes('nedel') || f.toLowerCase().includes('ipc')));

        // Also check the BI portal link (though it might be empty if it requires JS)
        console.log('\n--- Fetching BI Portal Content ---');
        const biUrl = 'http://bi.gks.ru/biportal/contourbi.jsp?allsol=1&solution=Dashboard&project=%2FDashboard%2FPrices';
        const resBi = await axios.get(biUrl, { httpsAgent: agent, headers, timeout: 10000 });
        console.log('BI Portal content type:', resBi.headers['content-type']);
        console.log('BI Sample:', resBi.data.substring(0, 500));

    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
