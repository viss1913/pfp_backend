# Content Factory — HTML для PDF (копия для PFP)

> **Каноническая версия для IDE:**  
> [`docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md`](../../docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md)

Этот файл — та же спецификация, лежит рядом с шаблонами Finam для удобства команды PFP.

**Кратко:** HTML от IDE должен быть **self-contained** — все картинки в `data:image/...;base64`, без `__CF_DATA_URI`, без `assets/`, без внешних CDN. Page-break только на `.sheet`, не на карточках. Иначе preview (`srcDoc`) и Puppeteer PDF покажут битые иконки / пустые страницы.

**Бриф для команды IDE:** [`docs/integrations/ide-content-html/IDE_PDF_READY_BRIEF.md`](../../docs/integrations/ide-content-html/IDE_PDF_READY_BRIEF.md)  
**Полный контракт:** [`docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md`](../../docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md)
