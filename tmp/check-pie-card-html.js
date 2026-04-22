const axios = require('axios');

async function main() {
  const base = process.env.PFP_BASE || 'https://pfpbackend-production.up.railway.app';
  const email = process.env.PFP_TEST_EMAIL;
  const password = process.env.PFP_TEST_PASSWORD;
  const clientId = Number(process.env.PFP_CLIENT_ID || '369');
  if (!email || !password) {
    throw new Error('Set PFP_TEST_EMAIL and PFP_TEST_PASSWORD');
  }

  const login = await axios.post(`${base}/api/auth/login`, { email, password }, { timeout: 60000 });
  const token = login.data.token;

  const pageTypes = ['OTHER', 'INVESTMENT'];
  for (const pt of pageTypes) {
    const url = `${base}/api/pfp/reports/${clientId}/pages/${pt}/html`;
    const r = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60000,
      validateStatus: () => true,
    });
    console.log(pt, 'status', r.status);
    if (r.status !== 200) continue;

    const html = r.data;
    console.log('  has pie-grid:', html.includes('pie-grid'));
    console.log('  has pie-card__title:', html.includes('pie-card__title'));
    console.log('  has pie-card:', html.includes('pie-card'));
    console.log('  has height 176:', html.includes('height: 176px'));
    console.log('  has white-space: normal for lg-name:', html.includes('white-space: normal'));
  }
}

main().catch((e) => {
  console.error('Failed:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});

