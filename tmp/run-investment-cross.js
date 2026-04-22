/**
 * Одноразовый прогон: env PFP_TEST_EMAIL, PFP_TEST_PASSWORD
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://pfpbackend-production.up.railway.app';
const payloadPath = path.join(__dirname, 'first-run-investment-cross-payload.json');
const outPath = path.join(__dirname, 'investment-cross-first-run-response.json');

async function main() {
  const email = process.env.PFP_TEST_EMAIL;
  const password = process.env.PFP_TEST_PASSWORD;
  if (!email || !password) {
    console.error('Need PFP_TEST_EMAIL and PFP_TEST_PASSWORD');
    process.exit(1);
  }
  const login = await axios.post(
    `${BASE}/api/auth/login`,
    { email, password },
    { timeout: 60000 }
  );
  const token = login.data.token;
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const res = await axios.post(`${BASE}/api/client/first-run`, payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 180000,
    validateStatus: () => true,
  });
  fs.writeFileSync(outPath, JSON.stringify(res.data, null, 2), 'utf8');
  console.log('HTTP', res.status, '->', outPath);
  if (res.status >= 400) process.exit(1);
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
