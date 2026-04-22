const axios = require('axios');

async function run() {
  const base = 'https://pfpbackend-production.up.railway.app';
  const email = 'skondratyuk@corp.finam.ru';
  const password = '123456';
  const clientId = 369;

  const login = await axios.post(`${base}/api/auth/login`, { email, password }, { timeout: 60000 });
  const token = login.data.token;

  const pageTypes = ['FIN_RESERVE', 'INVESTMENT', 'OTHER', 'LIFE'];
  for (const pt of pageTypes) {
    const url = `${base}/api/pfp/reports/${clientId}/pages/${pt}/html`;
    const r = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60000,
      validateStatus: () => true,
    });

    if (r.status !== 200) {
      console.log(pt, 'status', r.status);
      continue;
    }

    const html = r.data;
    const hasKlient = html.includes('Клиент:');
    const hasTitle = html.includes('client-panel__title');
    console.log(pt, 'Клиент:', hasKlient, 'client-panel__title:', hasTitle);
  }
}

run().catch((e) => {
  console.error(e.response?.status, e.response?.data || e.message);
  process.exit(1);
});

