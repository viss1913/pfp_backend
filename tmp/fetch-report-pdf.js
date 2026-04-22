const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
const email = process.env.PFP_TEST_EMAIL;
const password = process.env.PFP_TEST_PASSWORD;
const clientId = process.env.PFP_CLIENT_ID || '369';
const outPath = path.join(__dirname, `report-client-${clientId}.pdf`);

async function main() {
  if (!email || !password) {
    console.error('Set PFP_TEST_EMAIL and PFP_TEST_PASSWORD');
    process.exit(1);
  }
  const login = await axios.post(
    `${BASE}/api/auth/login`,
    { email, password },
    { timeout: 60000 }
  );
  const token = login.data.token;
  const url = `${BASE}/api/pfp/reports/${clientId}/pdf?includeCover=1&includeSummary=1&disposition=attachment`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    timeout: 300000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    console.error('HTTP', res.status, res.headers['content-type']);
    try {
      console.error(JSON.stringify(JSON.parse(Buffer.from(res.data).toString('utf8')), null, 2));
    } catch {
      console.error(Buffer.from(res.data).toString('utf8').slice(0, 500));
    }
    process.exit(1);
  }
  fs.writeFileSync(outPath, Buffer.from(res.data));
  console.log('OK', outPath, fs.statSync(outPath).size, 'bytes');
}

main().catch((e) => {
  console.error(e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
