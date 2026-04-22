const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
const email = process.env.PFP_TEST_EMAIL;
const password = process.env.PFP_TEST_PASSWORD;
const clientId = process.env.PFP_CLIENT_ID || '369';
const outPath = path.join(__dirname, `report-client-${clientId}.json`);

async function main() {
  const login = await axios.post(`${BASE}/api/auth/login`, { email, password }, { timeout: 60000 });
  const token = login.data.token;
  const res = await axios.get(`${BASE}/api/pfp/reports/${clientId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    console.error('HTTP', res.status, res.data);
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(res.data, null, 2), 'utf8');
  console.log('OK', outPath);
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
