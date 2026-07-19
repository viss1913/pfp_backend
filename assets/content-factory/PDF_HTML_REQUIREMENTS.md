# Content Factory — HTML для PDF (копия для PFP)

> **Каноническая версия для IDE:**  
> [`docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md`](../../docs/integrations/ide-content-html/PDF_HTML_REQUIREMENTS.md)

Этот файл — та же спецификация, лежит рядом с шаблонами Finam для удобства команды PFP.

**Кратко:** HTML от IDE должен быть **self-contained** — все картинки в `data:image/...;base64`, без `__CF_DATA_URI`, без `assets/`, без внешних CDN. Иначе preview (`srcDoc`) и Puppeteer PDF покажут битые иконки.

См. полный текст по ссылке выше (checklist, regex, constraints, acceptance).
