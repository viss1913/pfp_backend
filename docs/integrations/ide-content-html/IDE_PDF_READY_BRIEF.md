# IDE: что делать, чтобы PDF в PFP был нормальный

**Кому:** команда IDE (`ide-api`, Content HTML)  
**От:** PFP Content Factory  
**Дата:** 2026-08-03  
**Статус:** обязательный handoff на все будущие turn’ы

Полный контракт: [`PDF_HTML_REQUIREMENTS.md`](./PDF_HTML_REQUIREMENTS.md).  
Этот файл — короткий «что чинить у себя», без воды.

---

## Роли (не путать)

| Кто | Делает | Не делает |
|-----|--------|-----------|
| **IDE** | После каждого turn отдаёт **готовый к печати** HTML | PDF, email, utm |
| **PFP** | Сохраняет HTML, CTA/utm, Puppeteer → PDF, download | Правку вёрстки оффера |

Preview в админке PFP = тот же HTML (`iframe srcDoc`). Если в IDE «красиво», а в PFP «бито» — почти всегда в финальном `html` остались плейсхолдеры / `assets/` / внешние URL.

---

## MUST перед ответом turn в PFP

После **каждого** turn, который кладёт `html` в session / SSE `result`:

1. **Картинки только inline**  
   `data:image/...;base64,...` в `<img src>` и в `background-image: url(...)`.  
   Запрещено оставлять: `__CF_DATA_URI_*`, `assets/...`, `assets/user/...`, `http(s)://...` на img.

2. **Self-contained CSS**  
   Стили в `<style>` внутри документа.  
   Запрещено: `<link href="https://...">`, `@import url("https://...")`, Google Fonts CDN.  
   Шрифты: system stack или `@font-face` с base64 woff2.

3. **Page-break только на листах**  
   `page-break-after` / `break-after: page` — только на `.sheet` / `.page`.  
   Не вешать break на `.card`, KPI-блоки, секции внутри листа (иначе PDF рвётся на пустые страницы).

4. **CTA slot**  
   В HTML остаётся `<a data-cta-slot ...>`. PFP подставит href/label и `utm_agent`.

5. **Chrome шаблона Finam**  
   Не вырезать header/footer/лого из seed-шаблона; сохранить `data-cf-*` на `body`.

6. **Размер**  
   HTML на мегабайты с base64 — нормально. Не оставлять плейсхолдеры «ради экономии».

---

## Автопроверка (встроить в IDE перед `result.html`)

```javascript
function assertPdfReadyHtml(html) {
  const h = String(html || '');
  const errors = [];
  if (!h.trim()) errors.push('EMPTY_HTML');
  if (h.includes('__CF_DATA_URI')) errors.push('PLACEHOLDER_DATA_URI');
  if (/\bsrc\s*=\s*["']assets\//i.test(h)) errors.push('RELATIVE_IMG_SRC');
  if (/url\s*\(\s*["']?assets\//i.test(h)) errors.push('RELATIVE_CSS_URL');
  if (/<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(h)) errors.push('EXTERNAL_IMG');
  if (/@import\s+url\s*\(\s*["']?https?:\/\//i.test(h)) errors.push('EXTERNAL_CSS_IMPORT');
  if (!/\bdata-cta-slot\b/.test(h)) errors.push('MISSING_CTA_SLOT');
  if (/class=["'][^"']*\bcard\b[^"']*["'][^>]*style=["'][^"']*page-break/i.test(h)) {
    errors.push('SPARSE_CARD_PAGE_BREAK');
  }
  return errors;
}
```

Если `errors.length > 0` — **не отдавать** HTML в PFP (доинлайнить медиа / убрать break / починить CTA).

Рекомендуемый флаг в `constraints` сессии (PFP уже готов слать):

```json
{
  "pdf_ready": true,
  "inline_all_images": true,
  "preserve_template_chrome": true,
  "preserve_attributes": ["data-cta-slot"]
}
```

IDE: читать эти флаги в system prompt агента вёрстки.

---

## Что уже починил PFP (не ждите этого от IDE)

С 2026-08-03 на стороне PFP:

- перед PDF не выкидываем CSS из `<head>` оффера;
- инжектим print-safe CSS (схлопывает лишние page-break на карточках);
- sync из IDE, если в HTML ещё есть `__CF_DATA_URI` / `assets/`.

Это **страховка**, не замена MUST выше. Грязный HTML (плейсхолдеры, внешние картинки) PFP красивым не сделает.

---

## Чеклист для релиза IDE

- [ ] Post-process turn: инлайн всех медиа из session storage в HTML  
- [ ] Gate `assertPdfReadyHtml` перед SSE `result` / `GET session.html`  
- [ ] Запрет Google Fonts / внешних CSS в финальном HTML  
- [ ] Page-break только на `.sheet`  
- [ ] CTA `data-cta-slot` не съедается LLM  
- [ ] Smoke: тот же HTML открыть как файл offline → картинки на месте → print preview ≈ A4

---

## Контакт

Расхождения preview IDE ↔ PDF PFP: сначала прогнать checklist на `session.html`, потом писать в PFP.  
Канон: [`PDF_HTML_REQUIREMENTS.md`](./PDF_HTML_REQUIREMENTS.md).
