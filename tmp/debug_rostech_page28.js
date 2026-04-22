const fs = require('fs');
const path = require('path');

async function main() {
  const { buildRostechPensionPagesHtml } = require('../src/reports/themes/rostech/buildRostechPensionPagesHtml');

  const goal = {
    goal_name: 'Достойная пенсия',
    summary: {
      target_amount_initial: 100000,
      projected_pension_monthly_future: 412346,
      projected_pension_monthly_present: 100000,
    },
    details: { state_pension: { years_to_pension: 25 } },
  };

  const pages = await buildRostechPensionPagesHtml({
    goal,
    clientName: 'Тест',
    options: { inlineLocalAssets: false },
  });

  const html = pages[0] || '';
  const out = path.join(__dirname, 'debug-page28.html');
  fs.writeFileSync(out, html, 'utf8');

  const samples = html
    .split('src="')
    .slice(1, 8)
    .map((p) => p.split('"')[0]);

  console.log('saved_html', out);
  console.log('img_src_samples', samples);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

