const { injectYadroReportFonts } = require('../src/utils/yadroReportFonts');
const { renderYadroTemplate } = require('../src/reports/yadro/yadroTemplateLoader');

const h = renderYadroTemplate('cover.html', {
    cover_title: 'ТЕСТ ЯДРО',
    report_date: '25 июля 2026г.',
});
const withFont = injectYadroReportFonts(h);
const bodyOnly = withFont.replace(/<!--[\s\S]*?-->/g, '');

console.log('theme', /data-report-theme="yadro"/.test(withFont));
console.log('font', /data-yadro-pdf-font/.test(withFont));
console.log('title ok', withFont.includes('ТЕСТ ЯДРО'));
console.log('date ok', withFont.includes('25 июля 2026'));
console.log('leftover body', bodyOnly.match(/\{\{[a-zA-Z0-9_]+\}\}/g) || []);
const i = withFont.indexOf('cover-banner');
console.log(withFont.slice(i, i + 220));
console.log('font inject kb', Math.round((withFont.length - h.length) / 1024));
