const fs = require('fs');
const p = require('path').join(__dirname, '../src/reports/finam_v2/finamV2SberBranding.js');
let s = fs.readFileSync(p, 'utf8');
const wrong = '</motion>';
const right = '</div>';
const n = (s.match(/<\/motion>/g) || []).length;
s = s.split(wrong).join(right);
fs.writeFileSync(p, s);
console.log('replaced', n, 'occurrences');
