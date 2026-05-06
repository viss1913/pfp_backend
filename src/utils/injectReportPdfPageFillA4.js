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
  background-image:
    linear-gradient(rgba(100, 120, 170, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(100, 120, 170, 0.14) 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: 0 0;
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
  display: flex !important;
  flex-direction: column !important;
  background-color: transparent !important;
  background-image: none !important;
}
/* Клетка только на html (full-bleed A4); в шаблонах дублируется в ::before — убираем муар */
article.page::before {
  content: none !important;
  display: none !important;
}
/*
  Лист растянут на A4, но единственный ребёнок .content по умолчанию flex: 0 1 auto — остаётся
  по высоте контента; снизу видна только «клетка» article. Растягиваем .content на всю колонку.
  Футер прижимаем к низу только если внутри нет .spacer (там уже flex:1 разносит блоки).
*/
article.page > .content {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  align-self: stretch !important;
}
article.page > .content:not(:has(.spacer)) > footer.footer:last-child {
  margin-top: auto !important;
}
article.page > .content:not(:has(.spacer)) > .page-tail:last-child {
  margin-top: auto !important;
}
/*
  Многостраничные goal-шаблоны в одном файле: для «стр. 1» стоит
  article.page:first-of-type .spacer { flex: 0 0 8px }. После splitFinamPage4IntoStandalonePages
  в документе один article — он всегда first-of-type, спейсер остаётся 8px → дыра под футером на каждом листе PDF.
*/
article.page .spacer {
  flex: 1 1 auto !important;
  min-height: 8px !important;
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
