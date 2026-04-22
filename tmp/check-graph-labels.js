const axios = require("axios");

const base = "https://pfpbackend-production.up.railway.app";
const email = "skondratyuk@corp.finam.ru";
const password = "123456";
const clientId = 369;

async function main() {
  const login = await axios.post(`${base}/api/auth/login`, { email, password }, { timeout: 60000 });
  const token = login.data.token;

  const pageTypes = ["FIN_RESERVE", "INVESTMENT", "OTHER", "LIFE"];
  const re = /font-size="(8|9)"[^>]*>\s*(\d+)\s*<\/text>/g;

  for (const pt of pageTypes) {
    const url = `${base}/api/pfp/reports/${clientId}/pages/${pt}/html`;
    try {
      const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 60000, validateStatus: () => true });
      if (r.status !== 200) {
        console.log(pt, "status", r.status, "skip");
        continue;
      }
      const html = r.data;
      const matches = [...html.matchAll(re)];
      const nums = matches.map(m => m[2]);
      console.log(pt, "labels:", nums.length, "sample:", nums.slice(0, 12).join(","));
    } catch (e) {
      console.log(pt, "error", e.message);
    }
  }
}

main().catch((e) => {
  console.error("Failed:", e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
