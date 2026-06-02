import https from 'https';
import fs from 'fs';
import path from 'path';

const dir = 'docs/partners/assets/logos';
fs.mkdirSync(dir, { recursive: true });

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () =>
          resolve({ code: res.statusCode, buf: Buffer.concat(chunks), ct: res.headers['content-type'] })
        );
      })
      .on('error', reject);
  });
}

const tries = [
  ['https://www.klerk.ru/favicon.ico', 'klerk-favicon.ico'],
  ['https://www.klerk.ru/apple-touch-icon.png', 'klerk-apple.png'],
  ['https://cdn.klerk.ru/img/logo.svg', 'klerk.svg'],
  ['https://www.klerk.ru/build/images/logo.svg', 'klerk-build.svg'],
  ['https://www.sber.ru/common/fstatic/files/logo/sber-logo-green.svg', 'sber.svg'],
  ['https://www.sber.ru/common/fstatic/files/logo/sber-logo.svg', 'sber-alt.svg'],
  ['https://www.sber.ru/common/fstatic/files/logo/sber-logo-ru.svg', 'sber-ru.svg'],
];

for (const [url, file] of tries) {
  try {
    const { code, buf } = await get(url);
    if (code === 200 && buf.length > 100 && !buf.toString('utf8', 0, 50).includes('<!DOCTYPE')) {
      fs.writeFileSync(path.join(dir, file), buf);
      console.log('OK', file, buf.length, url);
    } else {
      console.log('SKIP', file, code, buf.length);
    }
  } catch (e) {
    console.log('ERR', file, e.message);
  }
}

// scrape klerk homepage for logo paths
try {
  const { buf } = await get('https://www.klerk.ru/');
  const html = buf.toString('utf8');
  const logos = [...html.matchAll(/(?:src|href)=["']([^"']*(?:logo|Logo|brand)[^"']*)["']/gi)].map((m) => m[1]);
  console.log('found paths:', [...new Set(logos)].slice(0, 15));
} catch (e) {
  console.log('scrape err', e.message);
}
