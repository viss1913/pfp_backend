import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'assets/content-factory/templates');
const logoB64 = fs.readFileSync(path.join(dir, 'finam-logo.base64.txt'), 'utf8').trim();

const themes = {
    light: {
        bg: '#f5f6f8',
        page: '#ffffff',
        text: '#1a1a1a',
        muted: '#5c6370',
        border: '#e2e5ea',
        accent: '#e85c0d',
        logoFilter: 'none',
        footerBg: '#f0f1f4',
        placeholderBg: '#fafbfc',
    },
    dark: {
        bg: '#0f1419',
        page: '#161b22',
        text: '#f0f3f6',
        muted: '#9aa3ad',
        border: '#2d333b',
        accent: '#ff8c42',
        logoFilter: 'brightness(0) invert(1)',
        footerBg: '#0d1117',
        placeholderBg: '#12171d',
    },
};

const orientations = {
    portrait: { w: '210mm', h: '297mm', logoH: '36px', contentMinH: '220mm' },
    landscape: { w: '297mm', h: '210mm', logoH: '32px', contentMinH: '145mm' },
};

function buildHtml(id, themeName, orientName) {
    const t = themes[themeName];
    const o = orientations[orientName];
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Finam Content Factory — ${id}</title>
  <style>
    @page { size: ${o.w} ${o.h}; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: ${t.bg};
      color: ${t.text};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: ${o.w};
      min-height: ${o.h};
      margin: 0 auto;
      background: ${t.page};
      display: flex;
      flex-direction: column;
      box-shadow: 0 0 0 1px ${t.border};
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14mm 16mm 10mm;
      border-bottom: 1px solid ${t.border};
    }
    .logo img {
      height: ${o.logoH};
      width: auto;
      display: block;
      filter: ${t.logoFilter};
    }
    .header-meta {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${t.muted};
    }
    .content {
      flex: 1 1 auto;
      padding: 12mm 16mm 10mm;
      min-height: ${o.contentMinH};
    }
    .content h1 {
      margin: 0 0 8mm;
      font-size: 28px;
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .content .lead {
      margin: 0 0 10mm;
      font-size: 15px;
      line-height: 1.55;
      color: ${t.muted};
      max-width: 95%;
    }
    .content .placeholder {
      border: 1px dashed ${t.border};
      border-radius: 8px;
      padding: 16mm 12mm;
      text-align: center;
      color: ${t.muted};
      font-size: 13px;
      line-height: 1.5;
      background: ${t.placeholderBg};
    }
    .cta-area {
      margin-top: 12mm;
      text-align: center;
    }
    .cta-area a[data-cta-slot] {
      display: inline-block;
      padding: 12px 28px;
      background: ${t.accent};
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
    .footer {
      margin-top: auto;
      padding: 6mm 16mm 8mm;
      border-top: 1px solid ${t.border};
      background: ${t.footerBg};
      font-size: 10px;
      line-height: 1.45;
      color: ${t.muted};
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    @media print {
      body { background: ${t.page}; }
      .sheet { box-shadow: none; margin: 0; }
    }
  </style>
</head>
<body data-cf-template="${id}" data-cf-orient="${orientName}" data-cf-theme="${themeName}">
  <article class="sheet">
    <header class="header">
      <div class="logo">
        <img src="data:image/png;base64,${logoB64}" alt="ФИНАМ" />
      </div>
      <div class="header-meta">Материал для клиента</div>
    </header>

    <main class="content">
      <h1>Заголовок оффера</h1>
      <p class="lead">Краткое описание продукта или предложения. Этот блок заменит IDE по brief из чата.</p>
      <div class="placeholder">Основной контент: текст, таблица, inline SVG-график, карточки преимуществ.</div>
      <div class="cta-area">
        <a data-cta-slot href="#">{{cta_label}}</a>
      </div>
    </main>

    <footer class="footer">
      <span>ООО «Финам» ИНН 323323232 +74951227788</span>
    </footer>
  </article>
</body>
</html>`;
}

const manifest = [];
for (const orient of ['portrait', 'landscape']) {
    for (const theme of ['light', 'dark']) {
        const id = `finam-a4-${orient}-${theme}`;
        const filename = `${id}.html`;
        fs.writeFileSync(path.join(dir, filename), buildHtml(id, theme, orient), 'utf8');
        manifest.push({
            id,
            file: filename,
            orientation: orient,
            theme,
            format: 'a4',
            page_size: orient === 'portrait' ? '210x297mm' : '297x210mm',
        });
    }
}

fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ version: 1, brand: 'finam', templates: manifest }, null, 2),
);

console.log('Templates:', manifest.map((m) => m.file).join(', '));
