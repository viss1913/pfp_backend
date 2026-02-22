const axios = require('axios');

async function test() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9'
  };

  // 1. Try the statistics page
  console.log('=== avgprocstav page ===');
  try {
    const r = await axios.get('https://www.cbr.ru/statistics/avgprocstav/', {
      headers,
      timeout: 15000,
      validateStatus: () => true
    });
    console.log('Status:', r.status);
    // Search for table data or numbers
    const html = r.data;
    // Find table with rates
    const tableMatch = html.match(/<table[^>]*class="data"[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      console.log('Found data table!');
      // Extract rows
      const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      if (rows) {
        rows.slice(0, 10).forEach((row, i) => {
          const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
          if (cells) {
            const cleaned = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
            console.log(`Row ${i}:`, cleaned.join(' | '));
          }
        });
      }
    } else {
      // Try finding any number patterns that look like rates
      const ratePattern = /(\d{1,2}[,\.]\d{1,4})\s*%/g;
      const matches = [];
      let m;
      while ((m = ratePattern.exec(html)) !== null && matches.length < 10) {
        matches.push(m[1]);
      }
      if (matches.length) {
        console.log('Found rate-like numbers:', matches);
      }

      // Search for relevant keywords
      for (const kw of ['procstav', 'ставк', 'вклад', 'депозит']) {
        const idx = html.toLowerCase().indexOf(kw.toLowerCase());
        if (idx > -1) {
          console.log(`\nFound "${kw}" context:`);
          console.log(html.substring(Math.max(0, idx - 100), idx + 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }
      }
    }
  } catch (e) { console.error('Error:', e.message); }

  // 2. Try download CSV/XLSX
  console.log('\n=== Try download ===');
  const downloadUrls = [
    'https://www.cbr.ru/statistics/avgprocstav/?UniDbQuery.Posted=True&UniDbQuery.From=01.01.2026&UniDbQuery.To=22.02.2026',
    'https://www.cbr.ru/statistics/avgprocstav/?UniDbQuery.Posted=True'
  ];
  for (const url of downloadUrls) {
    try {
      const r = await axios.get(url, {
        headers,
        timeout: 15000,
        validateStatus: () => true
      });
      console.log(`\nURL: ${url.substring(0, 80)}`);
      console.log('Status:', r.status);
      const html = r.data;
      // Find data table
      const tableMatch = html.match(/<table[^>]*class="data"[^>]*>([\s\S]*?)<\/table>/i);
      if (tableMatch) {
        console.log('Found data table!');
        const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
        if (rows) {
          rows.slice(0, 10).forEach((row, i) => {
            const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
            if (cells) {
              const cleaned = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
              console.log(`Row ${i}:`, cleaned.join(' | '));
            }
          });
        }
      } else {
        console.log('No data table found');
        // Check title
        const title = html.match(/<title[^>]*>(.*?)<\/title>/i);
        if (title) console.log('Page title:', title[1]);
      }
    } catch (e) { console.error('Error:', e.message); }
  }
}

test();
