process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,*/*', 'Accept-Language': 'ru-RU,ru;q=0.9'
};

async function test() {
    // 1. CBR dinamic page - extract ALL URLs and data from HTML
    console.log('=== CBR dinamic page - looking for JS data sources ===');
    try {
        const r = await axios.get('https://www.cbr.ru/analytics/dkp/dinamic/', { headers, timeout: 15000 });
        const html = r.data;

        // Find all URLs in the page that could be APIs
        const urlMatches = html.match(/["'](\/[^"'\s]+\.json[^"']*?)["']/gi) || [];
        const urlMatches2 = html.match(/["'](https?:\/\/[^"'\s]+(?:api|data|chart|json)[^"']*?)["']/gi) || [];
        const urlMatches3 = html.match(/url\s*[:=]\s*["']([^"']+)["']/gi) || [];
        const urlMatches4 = html.match(/src\s*=\s*["']([^"']*\.js[^"']*)["']/gi) || [];

        console.log('JSON URLs:', [...new Set(urlMatches)]);
        console.log('API URLs:', [...new Set(urlMatches2)]);
        console.log('url= patterns:', [...new Set(urlMatches3)]);
        console.log('JS files:', [...new Set(urlMatches4)].slice(0, 10));

        // Look for inline chart data
        const chartData = html.match(/(?:chartData|data|series|values)\s*[=:]\s*(\[[\s\S]{10,500}?\])/g);
        if (chartData) {
            console.log('\nChart data patterns:', chartData.map(d => d.substring(0, 200)));
        }

        // Look for any numbers that look like inflation (~0.01-1.0% weekly or 5-15% annual)
        const dataBlocks = html.match(/\b\d+[.,]\d{2,4}\b/g);
        if (dataBlocks) {
            console.log('\nNumber patterns (first 20):', [...new Set(dataBlocks)].slice(0, 20));
        }
    } catch (e) { console.error('CBR error:', e.message); }

    // 2. Rosstat with disabled SSL
    console.log('\n=== Rosstat (no SSL verify) ===');
    const rosstatUrls = [
        'https://rosstat.gov.ru/storage/mediabank/ipc_mes.htm',
        'https://rosstat.gov.ru/storage/mediabank/tab-ipc1.htm',
        'https://rosstat.gov.ru/price',
    ];
    for (const url of rosstatUrls) {
        try {
            const r = await axios.get(url, { headers, timeout: 15000, validateStatus: () => true, responseType: 'arraybuffer' });
            const ct = r.headers['content-type'] || '';
            const label = url.replace('https://rosstat.gov.ru', '');
            console.log(`\n${label}: ${r.status} (${ct.substring(0, 50)})`);
            if (r.status === 200) {
                let txt;
                if (ct.includes('windows-1251')) {
                    txt = new TextDecoder('windows-1251').decode(r.data);
                } else {
                    txt = Buffer.from(r.data).toString('utf8');
                }
                const tables = txt.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
                if (tables) {
                    console.log(`Found ${tables.length} tables`);
                    for (const t of tables.slice(0, 2)) {
                        if (t.length < 50000) {
                            const rows = t.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
                            if (rows) {
                                console.log(`Table (${rows.length} rows):`);
                                rows.slice(0, 10).forEach((row, i) => {
                                    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
                                    if (cells) {
                                        const clean = cells.map(c => c.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).join(' | ');
                                        if (clean.length > 3) console.log(`  Row ${i}: ${clean.substring(0, 250)}`);
                                    }
                                });
                            }
                        }
                    }
                } else {
                    const title = txt.match(/<title[^>]*>(.*?)<\/title>/i);
                    if (title) console.log('Title:', title[1].trim().substring(0, 100));
                }
            }
        } catch (e) { console.error(url.replace('https://rosstat.gov.ru', ''), e.message); }
    }
}

test();
