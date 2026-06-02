const https = require('https');
const buf = Buffer.alloc(100000, 'x');
const body = JSON.stringify({
  from: 'noreply@bank-future.com',
  to: ['delivered@resend.dev'],
  subject: 'big',
  html: 't',
  attachments: [{ filename: 't.pdf', content: buf.toString('base64') }],
});
const key = process.env.RESEND_API_KEY;
const req = https.request(
  {
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 60000,
  },
  (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => console.log('status', r.statusCode, b.slice(0, 200)));
  }
);
req.on('error', (e) => console.error('ERR', e.message));
req.write(body);
req.end();
