/**
 * При preferCssPageSize + @page A4 физическая страница ~297mm, а шаблоны с height: 842px
 * не заполняют лист — снизу (и иногда по бокам) остаётся белое поле.
 * Обложка (data-report-page="cover") не трогаем — у неё свой холст.
 */
const MARK = 'data-pfp-pdf-page-fill-a4';

const STYLE = `<style ${MARK}="1">
html {
  min-height: 297mm;
  background-color: #fafbfc;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  min-height: 297mm !important;
  margin: 0 !important;
  background: transparent !important;
}
article.page {
  min-height: 297mm !important;
  height: 297mm !important;
  max-height: 297mm !important;
  box-sizing: border-box !important;
}
article.page > .content {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  height: 100% !important;
}
article.page .content > footer.footer {
  margin-top: auto !important;
}
article.page .content > .page-tail {
  margin-top: auto !important;
}
</style>`;

function injectReportPdfPageFillA4(html) {
    const s = String(html || '');
    if (!s || s.includes(MARK)) return s;
    if (s.includes('data-report-page="cover"')) return s;
    if (!/<article[^>]*\bclass="[^"]*\bpage\b/i.test(s)) return s;
    if (!/<\/head>/i.test(s)) return s;
    return s.replace(/<\/head>/i, `${STYLE}\n</head>`);
}

module.exports = { injectReportPdfPageFillA4, MARK };
