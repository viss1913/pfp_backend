/**
 * Minimal Markdown → HTML for print/PDF (headings, lists, tables, bold, `code`, links).
 * Usage: node scripts/md_to_print_html.mjs <input.md> <output.html> "<document title>" [--consulting]
 *
 * --consulting: «консалтинговый» визуал (обложка, типографика, A4) — сохранить из браузера как PDF.
 */
import fs from 'fs';

const args = process.argv.slice(2);
const consulting = args.includes('--consulting');
const posArgs = args.filter((a) => a !== '--consulting');
const [inPath, outPath, docTitle = 'Document'] = posArgs;
if (!inPath || !outPath) {
  console.error('Usage: node scripts/md_to_print_html.mjs <input.md> <output.html> [title] [--consulting]');
  process.exit(1);
}

let md = fs.readFileSync(inPath, 'utf8');

/** Блоки ```mermaid ... ``` → плейсхолдеры (рендер через Mermaid.js в consulting HTML). */
const mermaidBlocks = [];
md = md.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, code) => {
  const i = mermaidBlocks.length;
  mermaidBlocks.push(code.trim());
  return `\n\n__MERMAID_BLOCK_${i}__\n\n`;
});

const lines = md.split(/\r?\n/);

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function flushParagraph(buf, out) {
  if (buf.length === 0) return;
  const text = buf.join(' ').trim();
  if (text) out.push(`<p>${inlineFormat(text)}</p>`);
  buf.length = 0;
}

const out = [];
const paraBuf = [];
let inUl = false;
let tableRows = [];

function closeUl() {
  if (inUl) {
    out.push('</ul>');
    inUl = false;
  }
}

function flushTable() {
  if (tableRows.length === 0) return;
  out.push('<table><thead>');
  const header = tableRows[0];
  out.push('<tr>' + header.map((c) => `<th>${inlineFormat(c.trim())}</th>`).join('') + '</tr>');
  out.push('</thead><tbody>');
  for (let r = 1; r < tableRows.length; r++) {
    out.push('<tr>' + tableRows[r].map((c) => `<td>${inlineFormat(c.trim())}</td>`).join('') + '</tr>');
  }
  out.push('</tbody></table>');
  tableRows = [];
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (trimmed.startsWith('|') && trimmed.includes('|')) {
    flushParagraph(paraBuf, out);
    closeUl();
    const cells = trimmed.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cells.every((c) => /^-+$/.test(c.trim().replace(/\s/g, '')))) {
      continue;
    }
    tableRows.push(cells);
    const next = lines[i + 1]?.trim() ?? '';
    if (!next.startsWith('|')) {
      flushTable();
    }
    continue;
  } else {
    flushTable();
  }

  if (trimmed === '') {
    flushParagraph(paraBuf, out);
    closeUl();
    continue;
  }

  if (trimmed.startsWith('# ')) {
    flushParagraph(paraBuf, out);
    closeUl();
    out.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
    continue;
  }
  if (trimmed.startsWith('## ')) {
    flushParagraph(paraBuf, out);
    closeUl();
    out.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
    continue;
  }
  if (trimmed.startsWith('### ')) {
    flushParagraph(paraBuf, out);
    closeUl();
    out.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
    continue;
  }
  if (trimmed.startsWith('#### ')) {
    flushParagraph(paraBuf, out);
    closeUl();
    out.push(`<h4>${inlineFormat(trimmed.slice(5))}</h4>`);
    continue;
  }

  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    flushParagraph(paraBuf, out);
    if (!inUl) {
      out.push('<ul>');
      inUl = true;
    }
    out.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
    continue;
  }

  if (trimmed === '---') {
    flushParagraph(paraBuf, out);
    closeUl();
    out.push('<hr />');
    continue;
  }

  if (trimmed.startsWith('> ')) {
    flushParagraph(paraBuf, out);
    closeUl();
    const quoteLines = [trimmed.slice(2)];
    while (i + 1 < lines.length && lines[i + 1].trim().startsWith('> ')) {
      i += 1;
      quoteLines.push(lines[i].trim().slice(2));
    }
    out.push(`<blockquote class="partner-question">${quoteLines.map((q) => inlineFormat(q)).join(' ')}</blockquote>`);
    continue;
  }

  const mermaidPh = trimmed.match(/^__MERMAID_BLOCK_(\d+)__$/);
  if (mermaidPh) {
    flushParagraph(paraBuf, out);
    closeUl();
    const idx = parseInt(mermaidPh[1], 10);
    const raw = mermaidBlocks[idx] ?? '';
    out.push(
      `<figure class="mermaid-wrap"><pre class="mermaid">${esc(raw)}</pre><figcaption class="mermaid-cap">Схема: откройте в браузере до печати в PDF — диаграмма дорисуется автоматически.</figcaption></figure>`
    );
    continue;
  }

  paraBuf.push(trimmed);
}

flushParagraph(paraBuf, out);
closeUl();
flushTable();

// На обложке уже есть заголовок — убираем первый <h1> из тела, если передан docTitle
if (docTitle && docTitle !== 'Document') {
  const i = out.findIndex((s) => s.startsWith('<h1>'));
  if (i >= 0) out.splice(i, 1);
}

let body = out.join('\n');
const titleEsc = esc(docTitle);

// Executive summary — выделенная панель в consulting-режиме
if (consulting) {
  body = body.replace(
    /(<h2>3\) Executive summary[^<]*<\/h2>)([\s\S]*?)(?=<h2>)/,
    '<aside class="exec-summary" aria-label="Executive summary">$1<div class="exec-summary__body">$2</div></aside>'
  );
}

const stylesDefault = `
    @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
    * { box-sizing: border-box; }
    html { font-size: 11pt; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      line-height: 1.45;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 12mm 0 16mm;
    }
    h1 {
      font-size: 1.65rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 0.35em;
      color: #0d2137;
      border-bottom: 3px solid #c9a227;
      padding-bottom: 0.35em;
    }
    h2 {
      font-size: 1.15rem;
      margin: 1.35em 0 0.5em;
      color: #123652;
      page-break-after: avoid;
    }
    h3 { font-size: 1.05rem; margin: 1em 0 0.4em; color: #1e4976; page-break-after: avoid; }
    h4 { font-size: 1rem; margin: 0.85em 0 0.35em; page-break-after: avoid; }
    p { margin: 0.45em 0; }
    ul { margin: 0.35em 0 0.65em 1.15em; padding: 0; }
    li { margin: 0.25em 0; }
    code {
      font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
      font-size: 0.88em;
      background: #f4f6f8;
      padding: 0.12em 0.35em;
      border-radius: 4px;
    }
    a { color: #0b5cab; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.65em 0 1em;
      font-size: 0.92em;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cfd6de;
      padding: 0.4em 0.55em;
      vertical-align: top;
    }
    th { background: #eef3f8; font-weight: 600; text-align: left; color: #0d2137; }
    tr:nth-child(even) td { background: #fafbfc; }
    hr {
      border: none;
      border-top: 1px solid #dde4eb;
      margin: 1.25em 0;
    }
    .cover {
      text-align: center;
      padding: 8mm 6mm 14mm;
      margin-bottom: 10mm;
      page-break-after: always;
      border: 1px solid #e2e8ef;
      border-radius: 6px;
      background: linear-gradient(165deg, #f8fafc 0%, #fff 45%, #f5f7fa 100%);
    }
    .cover .kicker { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7c8f; margin-bottom: 0.75rem; }
    .cover h1 { border: none; font-size: 1.5rem; padding: 0; margin: 0 0 0.5rem; }
    .cover .sub { font-size: 0.95rem; color: #4a5d73; max-width: 36rem; margin: 0 auto 1rem; }
    .cover .meta { font-size: 0.82rem; color: #7a8a9a; }
    @media print {
      body { padding: 0; }
      a { color: #000; }
    }
`;

const stylesConsulting = `
    /* Поля для экрана; для печати см. @media print ниже (@page :first без полей под обложку) */
    @page {
      size: A4;
      margin: 14mm 18mm 18mm 18mm;
    }
    * { box-sizing: border-box; }
    html { font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: "DM Sans", "Segoe UI", system-ui, sans-serif;
      font-feature-settings: "kern" 1, "liga" 1;
      line-height: 1.5;
      color: #1c2836;
      max-width: 210mm;
      margin: 0 auto;
      padding: 0 0 20mm;
      background: #fff;
    }
    .cover-consulting {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 22mm 20mm 18mm;
      margin: 0 0 8mm;
      page-break-after: always;
      background: linear-gradient(145deg, #061229 0%, #0c2744 42%, #0a1f35 100%);
      color: #f0f4f8;
      position: relative;
      overflow: hidden;
    }
    .cover-consulting::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 5px;
      background: linear-gradient(180deg, #d4b483 0%, #a67c3d 50%, #8b6914 100%);
    }
    .cover-consulting::after {
      content: "";
      position: absolute;
      right: -20%;
      top: 10%;
      width: 55%;
      height: 70%;
      background: radial-gradient(ellipse at center, rgba(212,180,131,0.08) 0%, transparent 70%);
      pointer-events: none;
    }
    .cover-consulting .brand-line {
      font-size: 0.68rem;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: rgba(240,244,248,0.55);
      margin-bottom: 6mm;
      position: relative;
      z-index: 1;
    }
    .cover-consulting h1 {
      font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
      font-size: 1.85rem;
      font-weight: 600;
      line-height: 1.2;
      margin: 0 0 5mm;
      padding: 0;
      border: none;
      color: #fff;
      letter-spacing: -0.02em;
      max-width: 28rem;
      position: relative;
      z-index: 1;
    }
    .cover-consulting .deck-tag {
      display: inline-block;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #d4b483;
      border: 1px solid rgba(212,180,131,0.45);
      padding: 0.35em 0.85em;
      margin-bottom: 8mm;
      position: relative;
      z-index: 1;
    }
    .cover-consulting .lead {
      font-size: 0.98rem;
      line-height: 1.55;
      color: rgba(230,237,245,0.88);
      max-width: 36rem;
      margin: 0;
      position: relative;
      z-index: 1;
    }
    .cover-consulting .cover-consulting__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      z-index: 1;
      min-height: 0;
    }
    .cover-consulting footer {
      font-size: 0.72rem;
      color: rgba(200,210,222,0.65);
      border-top: 1px solid rgba(255,255,255,0.12);
      padding-top: 5mm;
      margin-top: 0;
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }
    article {
      padding: 0 2mm;
    }
    article h2 {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #0c2744;
      margin: 2.2em 0 0.85em;
      padding-bottom: 0.45em;
      border-bottom: 2px solid #d4b483;
      page-break-after: avoid;
    }
    article h3 {
      font-size: 1.02rem;
      font-weight: 600;
      color: #123652;
      margin: 1.35em 0 0.5em;
      page-break-after: avoid;
    }
    article h4 {
      font-size: 0.95rem;
      font-weight: 600;
      color: #1a4971;
      margin: 1.1em 0 0.4em;
      page-break-after: avoid;
    }
    article p { margin: 0.5em 0; color: #2c3540; }
    blockquote.partner-question {
      margin: 1.1em 0 0.65em;
      padding: 0.85em 1em 0.85em 1.1em;
      border-left: 4px solid #c5a572;
      background: linear-gradient(90deg, #f7f4ee 0%, #fafbfc 100%);
      color: #0c2744;
      font-family: "Source Serif 4", Georgia, serif;
      font-size: 1.02em;
      line-height: 1.45;
      page-break-inside: avoid;
      box-shadow: 0 1px 2px rgba(6, 18, 41, 0.05);
    }
    blockquote.partner-question strong { font-weight: 600; }
    article p strong:first-child {
      display: block;
      margin-top: 0.15em;
      margin-bottom: 0.35em;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #5a6d82;
    }
    article ul {
      margin: 0.4em 0 1em;
      padding-left: 1.15em;
    }
    article li { margin: 0.35em 0; }
    article li::marker { color: #8b6914; }
    .exec-summary {
      margin: 1.5em 0 2em;
      page-break-inside: avoid;
    }
    .exec-summary .exec-summary__body {
      background: linear-gradient(180deg, #f7f8fa 0%, #f0f2f5 100%);
      border-left: 4px solid #c5a572;
      padding: 1em 1.15em 1.05em 1.25em;
      margin-top: 0.65em;
      box-shadow: 0 1px 3px rgba(6,18,41,0.06);
    }
    .exec-summary h2 {
      margin-top: 0;
      border-bottom: none;
      padding-bottom: 0;
      color: #0c2744;
      text-transform: none;
      letter-spacing: 0.02em;
      font-size: 1rem;
      font-weight: 700;
    }
    .exec-summary .exec-summary__body ul { margin-bottom: 0; }
    code {
      font-family: "JetBrains Mono", ui-monospace, Consolas, monospace;
      font-size: 0.85em;
      background: #eef1f5;
      padding: 0.1em 0.35em;
      border-radius: 3px;
      color: #1a3a52;
    }
    a { color: #0b5cab; text-decoration: none; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.85em 0 1.25em;
      font-size: 0.9em;
      page-break-inside: avoid;
      box-shadow: 0 1px 4px rgba(6,18,41,0.07);
    }
    th {
      background: #0c2744;
      color: #fff;
      font-weight: 600;
      text-align: left;
      padding: 0.55em 0.65em;
      font-size: 0.82rem;
      letter-spacing: 0.02em;
    }
    td {
      border: 1px solid #dce3ea;
      padding: 0.5em 0.65em;
      vertical-align: top;
      background: #fff;
    }
    tbody tr:nth-child(even) td { background: #fafbfc; }
    hr {
      border: none;
      height: 1px;
      background: linear-gradient(90deg, #d4b483, transparent);
      margin: 2em 0;
      opacity: 0.7;
    }
    .print-hint {
      display: none;
    }
    @media screen {
      .print-hint {
        display: block;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #0c2744;
        color: #e8eef5;
        padding: 10px 16px;
        font-size: 12px;
        text-align: center;
        z-index: 100;
      }
      .print-hint kbd { background: #1a3a52; padding: 2px 6px; border-radius: 4px; }
      body { padding-bottom: 44px; }
    }
    .mermaid-wrap {
      margin: 1rem 0 1.25rem;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #dce3ea;
      border-radius: 4px;
      page-break-inside: avoid;
      overflow-x: auto;
    }
    .mermaid-wrap pre.mermaid {
      margin: 0;
      font-size: 10px;
      line-height: 1.35;
      white-space: pre-wrap;
      background: transparent;
      color: #1c2836;
    }
    .mermaid-cap {
      font-size: 0.72rem;
      color: #6b7c8f;
      margin-top: 8px;
      font-style: italic;
    }
    @media print {
      @page {
        size: A4;
        margin: 14mm 18mm 18mm 18mm;
      }
      @page :first {
        margin: 0;
      }
      body { padding: 0; }
      .print-hint { display: none !important; }
      a { color: #1c2836; }
      /* Первая страница PDF: обложка на весь лист A4 (убирает «пустой низ») */
      .cover-consulting {
        min-height: 297mm;
        height: 297mm;
        margin: 0;
        padding: 26mm 22mm 22mm 28mm;
        box-sizing: border-box;
        page-break-after: always;
        break-after: page;
      }
      .mermaid-cap { display: none; }
    }
`;

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titleEsc}</title>
  ${consulting ? `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet" />` : ''}
  <style>
${consulting ? stylesConsulting : stylesDefault}
  </style>
</head>
<body>
${consulting ? `<div class="cover-consulting">
    <div class="cover-consulting__main">
      <div class="brand-line">BankFuture PFP · Инфраструктура и информационная безопасность</div>
      <span class="deck-tag">Технический меморандум</span>
      <h1>${titleEsc}</h1>
      <p class="lead">Материал для предварительного согласования с командами ИБ и ИТ АТБ Банка: масштаб работ, зависимости, сеть и целевой контур размещения.</p>
    </div>
    <footer>
      BankFuture PFP · Конфиденциально · материал для АТБ Банка · ${new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}
    </footer>
  </div>
  <div class="print-hint">Печать в PDF: <kbd>Ctrl</kbd>+<kbd>P</kbd> → Принтер «Сохранить как PDF» / Microsoft Print to PDF</div>` : `<div class="cover">
    <div class="kicker">Внутренний материал · ИБ / ИТ</div>
    <h1>${titleEsc}</h1>
    <p class="sub">Версия для печати и экспорта в PDF (Chrome / Edge: Печать → Сохранить как PDF)</p>
    <p class="meta">Сгенерировано из Markdown · ${new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>`}
  <article>
${body}
  </article>
${body.includes('mermaid-wrap') ? `
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: ${consulting ? "'base'" : "'neutral'"},
      securityLevel: 'loose',
      themeVariables: ${consulting ? "{ fontFamily: 'DM Sans, sans-serif', primaryTextColor: '#0c2744', lineColor: '#5a6d82', primaryColor: '#eef3f8', secondaryColor: '#f7f8fa' }" : '{}'}
    });
  </script>` : ''}
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log('Wrote', outPath, consulting ? '(consulting theme)' : '');
